# Phase 2: Brain Upload - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable users to upload brain MRI modalities (T1, T2, FLAIR, T1c) in .nii.gz format through the brain project. Uploaded files appear immediately in patient detail. Viewer functionality is a separate phase.

</domain>

<decisions>
## Implementation Decisions

### Upload flow
- Follow existing maxillo upload pattern — dedicated upload page per patient
- Four input boxes, one per modality (T1, T2, FLAIR, T1c)
- At least one modality required, others optional
- Only .nii.gz files accepted
- After successful upload, redirect to patient detail page

### Validation
- Client-side validation first — check file extension immediately on selection
- Block invalid files before form submission
- Server-side validation as backup

### File type registry
- Use distinct file_type values: 'brain_t1', 'brain_t2', 'brain_flair', 'brain_t1c'
- Simple queries per modality type

### Claude's Discretion
- Replace behavior when modality already exists (follow maxillo patterns)
- Upload progress indicators
- Error message wording
- Form layout and styling details

</decisions>

<specifics>
## Specific Ideas

- "Same as maxillo" — follow existing upload patterns and page structure
- Four separate input boxes, one per modality — clear visual mapping

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-brain-upload*
*Context gathered: 2026-01-27*
