from django.db import models
from django.conf import settings
from common.models import Project
from maxillo.models import Patient as MaxilloPatient


class RegionType(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="region_types"
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#3498db")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        unique_together = ("project", "name")

    def __str__(self):
        return f"{self.project} / {self.name}"


class QuadrantType(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="quadrant_types"
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#e74c3c")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        unique_together = ("project", "name")

    def __str__(self):
        return f"{self.project} / {self.name}"


class RegionTypeUserColor(models.Model):
    region_type = models.ForeignKey(
        RegionType, on_delete=models.CASCADE, related_name="user_colors"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="laparoscopy_region_colors",
    )
    color = models.CharField(max_length=7)

    class Meta:
        unique_together = ("region_type", "user")

    def __str__(self):
        return f"{self.user} / {self.region_type.name} / {self.color}"


class QuadrantTypeUserColor(models.Model):
    quadrant_type = models.ForeignKey(
        QuadrantType, on_delete=models.CASCADE, related_name="user_colors"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="laparoscopy_quadrant_colors",
    )
    color = models.CharField(max_length=7)

    class Meta:
        unique_together = ("quadrant_type", "user")

    def __str__(self):
        return f"{self.user} / {self.quadrant_type.name} / {self.color}"


class QuadrantClassificationMarker(models.Model):
    patient = models.ForeignKey(
        "maxillo.Patient",
        on_delete=models.CASCADE,
        related_name="laparoscopy_quadrant_markers",
    )
    quadrant_type = models.ForeignKey(
        QuadrantType,
        on_delete=models.CASCADE,
        related_name="markers",
    )
    time_ms = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_laparoscopy_quadrant_markers",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="updated_laparoscopy_quadrant_markers",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["time_ms", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "time_ms"],
                name="laparo_unique_patient_quadrant_marker_time",
            )
        ]
        indexes = [
            models.Index(fields=["patient", "time_ms"]),
            models.Index(fields=["patient", "quadrant_type"]),
        ]

    def __str__(self):
        return f"Marker {self.id} patient {self.patient_id} @ {self.time_ms}ms"


class RegionAnnotation(models.Model):
    TOOL_CHOICES = [
        ("brush", "Brush"),
        ("eraser", "Eraser"),
        ("polygon", "Polygon"),
    ]

    patient = models.ForeignKey(
        "maxillo.Patient",
        on_delete=models.CASCADE,
        related_name="laparoscopy_region_annotations",
    )
    region_type = models.ForeignKey(
        RegionType,
        on_delete=models.CASCADE,
        related_name="annotations",
    )
    tool = models.CharField(max_length=20, choices=TOOL_CHOICES)
    frame_time = models.FloatField(default=0.0)
    points = models.JSONField(default=list)
    stroke_width = models.FloatField(default=1.0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_laparoscopy_annotations",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="updated_laparoscopy_annotations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["patient", "frame_time"]),
            models.Index(fields=["patient", "region_type"]),
            models.Index(fields=["created_by"]),
        ]

    def __str__(self):
        return f"Annotation {self.id} ({self.tool}) on patient {self.patient_id}"


class LaparoscopyPatient(MaxilloPatient):
    class Meta:
        proxy = True
        verbose_name = "Patient"
        verbose_name_plural = "Patients"
