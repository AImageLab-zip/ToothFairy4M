"""Export processor for background export generation."""

import os
import sys
import zipfile
import logging
import subprocess
import tempfile
from pathlib import Path
from django.conf import settings
from django.utils import timezone

from common.file_access import exists as artifact_exists
from common.file_access import iter_bytes as iter_artifact_bytes
from common.object_storage import get_object_storage

logger = logging.getLogger(__name__)


class ExportProcessor:
    """Processes export jobs by querying patients, collecting files, and creating ZIP archives."""

    RAW_ONLY_MODALITY_SLUGS = {
        "teleradiography",
        "panoramic",
    }

    # Map modality slugs to file types (only processed files, except intraoral which has no processing step)
    MODALITY_TO_FILE_TYPES = {
        "cbct": ["cbct_processed"],  # Only processed
        "ios": ["ios_processed_upper", "ios_processed_lower"],  # Only processed
        "audio": ["audio_processed"],  # Only processed
        "bite_classification": ["bite_classification"],
        "intraoral": ["intraoral_raw"],  # No processing step; raw IS the usable file
        "intraoral-photo": ["intraoral_raw"],  # Actual DB slug; same as above
        "teleradiography": ["teleradiography_raw"],  # Raw by default
        "panoramic": ["panoramic_raw"],  # Raw by default
        "braintumor-mri-t1": ["braintumor_mri_t1_processed"],  # Only processed
        "braintumor-mri-t1c": ["braintumor_mri_t1c_processed"],  # Only processed
        "braintumor-mri-t2": ["braintumor_mri_t2_processed"],  # Only processed
        "braintumor-mri-flair": ["braintumor_mri_flair_processed"],  # Only processed
        "rawzip": ["generic_processed"],  # Only processed
    }

    def __init__(self, export, domain="maxillo"):
        """Initialize processor with export instance."""
        self.export = export
        self.domain = domain
        self.query_params = export.query_params
        self.folder_ids = self.query_params.get("folder_ids", [])
        self.modality_slugs = self.query_params.get("modality_slugs", [])
        self.filters = self.query_params.get("filters", {})

    def _update_progress(self, message, percent=None):
        """Update progress on the Export record for live feedback."""
        if self.domain == "brain":
            from brain.models import Export
        else:
            from ..models import Export
        update_kw = {"progress_message": message}
        if percent is not None:
            update_kw["progress_percent"] = min(100, max(0, int(percent)))
        Export.objects.filter(pk=self.export.pk).update(**update_kw)

    def query_patients(self):
        """Query patients based on folder_ids and filters. Apply AND logic for all filters."""
        if self.domain == "brain":
            from brain.models import Patient, VoiceCaption
        else:
            from ..models import Patient, VoiceCaption
        from common.models import FileRegistry, Modality

        # Start with folder filter
        patients = (
            Patient.objects.filter(folder_id__in=self.folder_ids)
            if self.folder_ids
            else Patient.objects.none()
        )

        if not patients.exists():
            return patients

        # Apply modality presence filters (checking for processed files)
        if self.filters.get("has_cbct"):
            file_filter = {"file_type": "cbct_processed", "domain": self.domain}
            if self.domain == "brain":
                cbct_patients = Patient.objects.filter(
                    patient_id__in=FileRegistry.objects.filter(
                        **file_filter
                    ).values_list("brain_patient_id", flat=True)
                ).distinct()
            else:
                cbct_patients = Patient.objects.filter(
                    files__file_type="cbct_processed"
                ).distinct()
            patients = patients.filter(
                patient_id__in=cbct_patients.values_list("patient_id", flat=True)
            )

        if self.filters.get("has_ios"):
            if self.domain == "brain":
                ios_patients = Patient.objects.filter(
                    patient_id__in=FileRegistry.objects.filter(
                        domain="brain",
                        file_type__in=["ios_processed_upper", "ios_processed_lower"],
                    ).values_list("brain_patient_id", flat=True)
                ).distinct()
            else:
                ios_patients = Patient.objects.filter(
                    files__file_type__in=["ios_processed_upper", "ios_processed_lower"]
                ).distinct()
            patients = patients.filter(
                patient_id__in=ios_patients.values_list("patient_id", flat=True)
            )

        # Dynamic modality presence filters
        for key, value in self.filters.items():
            if key.startswith("has_") and not key.startswith("has_reports_") and value:
                modality_slug = key.replace("has_", "")
                file_types = self.MODALITY_TO_FILE_TYPES.get(modality_slug, [])
                if file_types:
                    if self.domain == "brain":
                        modality_patients = Patient.objects.filter(
                            patient_id__in=FileRegistry.objects.filter(
                                domain="brain", file_type__in=file_types
                            ).values_list("brain_patient_id", flat=True)
                        ).distinct()
                    else:
                        modality_patients = Patient.objects.filter(
                            files__file_type__in=file_types
                        ).distinct()
                    patients = patients.filter(
                        patient_id__in=modality_patients.values_list(
                            "patient_id", flat=True
                        )
                    )

        # Report presence filters
        for key, value in self.filters.items():
            if key.startswith("has_reports_") and value:
                modality_slug = key.replace("has_reports_", "")
                try:
                    modality = Modality.objects.get(slug=modality_slug)
                    # Patients with voice captions for this modality
                    report_patients = (
                        Patient.objects.filter(
                            voice_captions__modality=modality,
                            voice_captions__text_caption__isnull=False,
                        )
                        .exclude(voice_captions__text_caption="")
                        .distinct()
                    )
                    patients = patients.filter(
                        patient_id__in=report_patients.values_list(
                            "patient_id", flat=True
                        )
                    )
                except Modality.DoesNotExist:
                    pass

        return patients.distinct()

    def collect_files(self, patients):
        """Collect files from FileRegistry for each patient and selected modalities."""
        if self.domain == "brain":
            from brain.models import VoiceCaption
        else:
            from ..models import VoiceCaption
        from common.models import FileRegistry, Modality

        files_to_export = []
        total_size = 0

        # Separate reports from actual modalities
        actual_modality_slugs = [
            slug for slug in self.modality_slugs if slug != "reports"
        ]

        # Get file types for selected modalities (excluding reports)
        file_types = []
        for modality_slug in actual_modality_slugs:
            file_types.extend(self.MODALITY_TO_FILE_TYPES.get(modality_slug, []))

        logger.info(
            f"Collecting files for modalities: {actual_modality_slugs}, file_types: {file_types}"
        )

        processed_fallback_slugs = [
            slug
            for slug in actual_modality_slugs
            if slug not in self.RAW_ONLY_MODALITY_SLUGS
        ]

        # Also check by modality relationship
        modality_objects = Modality.objects.filter(slug__in=actual_modality_slugs)
        fallback_modality_objects = Modality.objects.filter(
            slug__in=processed_fallback_slugs
        )
        logger.info(f"Found {modality_objects.count()} modality objects")

        for patient in patients:
            # Collect files from FileRegistry (only processed files)
            # Build query to match file_type in our list OR (modality match AND file is processed)
            from django.db.models import Q

            # Base query: match by file_type (this catches files even if modality is None)
            query = Q(file_type__in=file_types)

            # For modality-based matching, also include files that match by modality relationship
            # (even if file_type is not in our explicit list, but modality matches)
            if fallback_modality_objects.exists():
                # Match by modality relationship (for files that have modality set)
                # Only include processed files
                query |= Q(
                    modality__in=fallback_modality_objects,
                    file_type__endswith="_processed",
                ) | Q(
                    modality__in=fallback_modality_objects,
                    file_type="bite_classification",
                )

            if self.domain == "brain":
                patient_files = (
                    FileRegistry.objects.filter(domain="brain", brain_patient=patient)
                    .filter(query)
                    .distinct()
                )
            else:
                patient_files = (
                    FileRegistry.objects.filter(domain="maxillo", patient=patient)
                    .filter(query)
                    .distinct()
                )
            logger.info(
                f"Patient {patient.patient_id}: found {patient_files.count()} files matching query"
            )

            for file_reg in patient_files:
                logger.debug(
                    f"  Processing file: {file_reg.file_type}, path: {file_reg.file_path}, modality: {file_reg.modality}"
                )
                # Double-check: only export files that are in the explicitly requested file_types
                # list (handles ios_processed_upper / ios_processed_lower which don't end with
                # '_processed'), or any other processed/bite_classification file from a modality
                # relationship match.
                is_mapped_file_type = file_reg.file_type in file_types
                is_processed_fallback = (
                    file_reg.modality is not None
                    and file_reg.modality.slug in processed_fallback_slugs
                    and (
                        file_reg.file_type.endswith("_processed")
                        or file_reg.file_type == "bite_classification"
                    )
                )
                if is_mapped_file_type or is_processed_fallback:
                    # Determine modality slug for file organization
                    if file_reg.modality:
                        modality_slug = file_reg.modality.slug
                    else:
                        # Infer from file_type if modality is not set
                        if file_reg.file_type.startswith("ios_"):
                            modality_slug = "ios"
                        elif file_reg.file_type.startswith("cbct_"):
                            modality_slug = "cbct"
                        elif file_reg.file_type.startswith("audio_"):
                            modality_slug = "audio"
                        elif file_reg.file_type.startswith("intraoral_"):
                            modality_slug = "intraoral-photo"
                        elif file_reg.file_type.startswith("teleradiography_"):
                            modality_slug = "teleradiography"
                        elif file_reg.file_type.startswith("panoramic_"):
                            modality_slug = "panoramic"
                        else:
                            modality_slug = None

                    logger.debug(
                        f"    Modality slug: {modality_slug}, file_path: {file_reg.file_path}, exists: {artifact_exists(file_reg.file_path) if file_reg.file_path else False}"
                    )

                    # Special handling for CBCT processed: files are stored in metadata['files']
                    if (
                        file_reg.file_type == "cbct_processed"
                        and file_reg.metadata
                        and "files" in file_reg.metadata
                    ):
                        # Export all files from metadata (volume_nifti, panoramic_view, etc.)
                        cbct_files = file_reg.metadata.get("files", {})
                        for file_type_key, file_data in cbct_files.items():
                            if isinstance(file_data, dict) and "path" in file_data:
                                file_path = file_data["path"]
                                if artifact_exists(file_path):
                                    files_to_export.append(
                                        {
                                            "type": "file",
                                            "patient": patient,
                                            "file_registry": file_reg,
                                            "path": file_path,
                                            "modality_slug": modality_slug,
                                            "cbct_file_type": file_type_key,  # e.g., 'volume_nifti', 'panoramic_view'
                                        }
                                    )
                                    # Use individual file size from metadata
                                    file_size = file_data.get("size", 0)
                                    total_size += file_size
                                else:
                                    logger.warning(
                                        f"CBCT processed file not found: {file_path}"
                                    )
                    elif file_reg.file_path and artifact_exists(file_reg.file_path):
                        # Standard single-file export
                        logger.info(
                            f"  Adding file: {file_reg.file_type} (modality: {modality_slug}) from {file_reg.file_path}"
                        )
                        files_to_export.append(
                            {
                                "type": "file",
                                "patient": patient,
                                "file_registry": file_reg,
                                "path": file_reg.file_path,
                                "modality_slug": modality_slug,
                            }
                        )
                        total_size += int(file_reg.file_size or 0)
                    elif not file_reg.file_path:
                        logger.warning(
                            f"FileRegistry {file_reg.id} ({file_reg.file_type}) has no file_path and no metadata files"
                        )
                    else:
                        logger.warning(
                            f"File not found: {file_reg.file_path} (file_type: {file_reg.file_type}, patient: {patient.patient_id})"
                        )
                else:
                    logger.debug(
                        f"  Skipping file {file_reg.file_type}: not in expected mapped types and not eligible processed fallback"
                    )

            # Collect VoiceCaption text files for reports (only if 'reports' is selected)
            if "reports" in self.modality_slugs:
                # When reports-only: use all active modalities; otherwise use selected modalities
                report_modality_slugs = [
                    s for s in self.modality_slugs if s != "reports"
                ]
                if not report_modality_slugs:
                    report_modality_slugs = list(
                        Modality.objects.filter(is_active=True).values_list(
                            "slug", flat=True
                        )
                    )
                for modality_slug in report_modality_slugs:
                    try:
                        modality = Modality.objects.get(slug=modality_slug)
                        voice_captions = VoiceCaption.objects.filter(
                            patient=patient,
                            modality=modality,
                            text_caption__isnull=False,
                        ).exclude(text_caption="")

                        for vc in voice_captions:
                            # Create a virtual file entry for the text caption (user_id = annotator for unique filename)
                            files_to_export.append(
                                {
                                    "type": "report",
                                    "patient": patient,
                                    "voice_caption": vc,
                                    "modality_slug": modality_slug,
                                    "content": vc.text_caption,
                                    "user_id": vc.user_id,
                                }
                            )
                            # Estimate text file size
                            total_size += len(vc.text_caption.encode("utf-8"))
                    except Modality.DoesNotExist:
                        pass

        logger.info(
            f"Total files collected: {len(files_to_export)}, total size: {total_size} bytes"
        )
        return files_to_export, total_size

    def create_zip(self, files_to_export, export_path):
        """Create ZIP file with structure: patient_{id}_{name}/modality/files and reports/."""
        os.makedirs(os.path.dirname(export_path), exist_ok=True)

        # Organize files by patient
        patient_files = {}
        for file_info in files_to_export:
            patient = file_info["patient"]
            patient_key = patient.patient_id

            if patient_key not in patient_files:
                patient_files[patient_key] = {
                    "patient": patient,
                    "files": [],
                    "reports": {},
                }

            if file_info["type"] == "file":
                patient_files[patient_key]["files"].append(file_info)
            elif file_info["type"] == "report":
                modality_slug = file_info["modality_slug"]
                if modality_slug not in patient_files[patient_key]["reports"]:
                    patient_files[patient_key]["reports"][modality_slug] = []
                patient_files[patient_key]["reports"][modality_slug].append(file_info)

        # Count total ZIP entries for progress
        total_entries = 0
        for patient_data in patient_files.values():
            modality_files = {}
            for file_info in patient_data["files"]:
                modality_slug = file_info.get("modality_slug") or "unknown"
                modality_files.setdefault(modality_slug, []).append(file_info)
            total_entries += sum(len(f) for f in modality_files.values())
            total_entries += sum(len(r) for r in patient_data["reports"].values())

        progress_interval = max(
            1, total_entries // 50
        )  # ~50 updates over the ZIP phase
        current_entry = [0]  # use list so inner closure can mutate

        with zipfile.ZipFile(export_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Add files to ZIP
            for patient_key, patient_data in patient_files.items():
                patient = patient_data["patient"]

                # Create patient folder name
                if patient.name:
                    patient_folder = f"patient_{patient.patient_id}_{patient.name}"
                else:
                    patient_folder = f"patient_{patient.patient_id}"
                # Sanitize folder name (remove invalid characters)
                patient_folder = "".join(
                    c for c in patient_folder if c.isalnum() or c in ("_", "-", " ")
                )
                patient_folder = patient_folder.replace(" ", "_")

                # Group files by modality
                modality_files = {}
                for file_info in patient_data["files"]:
                    modality_slug = file_info.get("modality_slug") or "unknown"
                    if modality_slug not in modality_files:
                        modality_files[modality_slug] = []
                    modality_files[modality_slug].append(file_info)

                # Add files to ZIP organized by modality
                for modality_slug, files in modality_files.items():
                    for file_info in files:
                        file_reg = file_info["file_registry"]
                        source_path = file_info["path"]

                        if not artifact_exists(source_path):
                            logger.warning(f"Skipping missing file: {source_path}")
                            continue

                        # For CBCT files, use a descriptive filename based on file type
                        if modality_slug == "cbct" and "cbct_file_type" in file_info:
                            cbct_file_type = file_info["cbct_file_type"]
                            # Map CBCT file types to descriptive names
                            cbct_filename_map = {
                                "volume_nifti": "volume.nii.gz",
                                "panoramic_view": "panoramic.png",
                                "structures_mesh": "structures.stl",
                            }
                            # Handle multiple mesh files (structures_mesh_1, structures_mesh_2, etc.)
                            if cbct_file_type.startswith("structures_mesh"):
                                if cbct_file_type == "structures_mesh":
                                    filename = "structures.stl"
                                else:
                                    # Extract number if present (e.g., structures_mesh_1 -> structures_1.stl)
                                    suffix = cbct_file_type.replace(
                                        "structures_mesh_", ""
                                    )
                                    filename = (
                                        f"structures_{suffix}.stl"
                                        if suffix
                                        else "structures.stl"
                                    )
                            else:
                                filename = cbct_filename_map.get(
                                    cbct_file_type,
                                    os.path.basename((source_path or "").rstrip("/"))
                                    or "file",
                                )
                        else:
                            # Standard filename from path
                            filename = (
                                os.path.basename((source_path or "").rstrip("/"))
                                or "file"
                            )

                        # Create destination path: patient_folder/modality/filename
                        dest_path = f"{patient_folder}/{modality_slug}/{filename}"

                        try:
                            with zipf.open(dest_path, mode="w", force_zip64=True) as zf:
                                for chunk in iter_artifact_bytes(source_path):
                                    zf.write(chunk)
                        except Exception as e:
                            logger.error(f"Error adding file {source_path} to ZIP: {e}")
                        current_entry[0] += 1
                        if total_entries and current_entry[0] % progress_interval == 0:
                            pct = 20 + int(75 * current_entry[0] / total_entries)
                            self._update_progress(
                                f"Writing ZIP ({current_entry[0]}/{total_entries} files)",
                                pct,
                            )

                # Add report files (filename includes annotator user_id to avoid overwriting)
                for modality_slug, reports in patient_data["reports"].items():
                    for report_info in reports:
                        content = report_info["content"]
                        user_id = report_info.get("user_id", "unknown")
                        filename = f"{modality_slug}_{user_id}.txt"
                        dest_path = f"{patient_folder}/reports/{filename}"

                        # Write text content to ZIP
                        zipf.writestr(dest_path, content)
                        current_entry[0] += 1
                        if total_entries and current_entry[0] % progress_interval == 0:
                            pct = 20 + int(75 * current_entry[0] / total_entries)
                            self._update_progress(
                                f"Writing ZIP ({current_entry[0]}/{total_entries} files)",
                                pct,
                            )

        return os.path.getsize(export_path)

    def process_export(self):
        """Main processing method. Queries patients, collects files, creates ZIP, and updates export."""
        try:
            # Query patients
            patients = self.query_patients()
            patient_count = patients.count()

            if patient_count == 0:
                self.export.mark_failed("No patients match the selected criteria.")
                return

            # Update patient count early so status API shows progress
            self.export.patient_count = patient_count
            self.export.save(update_fields=["patient_count"])
            self._update_progress(f"Collected {patient_count} patients", 5)

            # Collect files
            self._update_progress("Collecting files...", 10)
            files_to_export, estimated_size = self.collect_files(patients)

            if not files_to_export:
                self.export.mark_failed(
                    "No files found for the selected patients and modalities."
                )
                return

            # Generate filename
            timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
            filename = f"export_{self.export.id}_{timestamp}.zip"
            storage = get_object_storage()
            storage_key = f"exports/{filename}"

            self._update_progress("Writing ZIP...", 15)
            with tempfile.TemporaryDirectory(prefix="tf_export_") as tmpdir:
                export_path = os.path.join(tmpdir, filename)

                # Create ZIP (reports progress 20–95%)
                actual_size = self.create_zip(files_to_export, export_path)

                # Upload ZIP to object storage
                storage.upload_file(
                    export_path,
                    key=storage_key,
                    content_type="application/zip",
                    metadata={
                        "export_id": str(self.export.id),
                        "user_id": str(getattr(self.export, "user_id", "") or ""),
                    },
                )

                # Update export with results
                self.export.mark_completed(file_path=storage_key, file_size=actual_size)

            logger.info(
                f"Export {self.export.id} completed successfully. Size: {actual_size} bytes"
            )

        except Exception as e:
            logger.error(
                f"Error processing export {self.export.id}: {e}", exc_info=True
            )
            self.export.mark_failed(str(e))


def start_export_processing(export_id, domain="maxillo"):
    """Start background processing for an export in a subprocess.

    Uses a subprocess instead of a daemon thread so the export completes even
    after the HTTP request ends (web workers can recycle and kill threads).
    """
    from ..models import Export as MaxilloExport
    from brain.models import Export as BrainExport

    try:
        if domain == "brain":
            export = BrainExport.objects.filter(id=export_id).first()
        else:
            export = MaxilloExport.objects.filter(id=export_id).first()

        if not export:
            logger.error(f"Export {export_id} not found for domain {domain}")
            return

        export.mark_processing()

        # Run in a detached subprocess so it survives the request/worker
        base_dir = Path(settings.BASE_DIR)
        manage_py = base_dir / "manage.py"
        cmd = [
            sys.executable,
            str(manage_py),
            "run_export",
            str(export_id),
            "--domain",
            domain,
        ]
        subprocess.Popen(
            cmd,
            cwd=str(base_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        logger.info(f"Started background subprocess for export {export_id}")
    except (MaxilloExport.DoesNotExist, BrainExport.DoesNotExist):
        logger.error(f"Export {export_id} not found")
    except Exception as e:
        logger.error(f"Error starting export processing: {e}", exc_info=True)
        try:
            export = MaxilloExport.objects.filter(
                id=export_id
            ).first() or BrainExport.objects.get(id=export_id)
            export.mark_failed(str(e))
        except Exception:
            pass
