from django.urls import path, include

from . import views

urlpatterns = [
    # Project switcher — sets the session and redirects to patient list
    path("", views.set_laparoscopy, name="laparoscopy_home"),
    # Range-aware video serve endpoint (supports HTTP Range for browser seeking)
    # URL: /laparoscopy/video/<file_id>/
    path("video/<int:file_id>/", views.serve_video, name="laparoscopy_serve_video"),
    # Region annotation persistence API
    path(
        "api/patient/<int:patient_id>/annotations/",
        views.patient_region_annotations,
        name="patient_region_annotations",
    ),
    path(
        "api/annotations/<int:annotation_id>/",
        views.region_annotation_detail,
        name="region_annotation_detail",
    ),
    path(
        "api/patient/<int:patient_id>/quadrant-markers/",
        views.patient_quadrant_markers,
        name="patient_quadrant_markers",
    ),
    path(
        "api/worker/session-ready/",
        views.worker_session_ready,
        name="worker_session_ready",
    ),
    path(
        "api/worker/session-prompt/",
        views.worker_session_prompt,
        name="worker_session_prompt",
    ),
    # Region Types API (admin-gated mutations)
    path("api/region-types/", views.region_types, name="region_types"),
    path(
        "api/region-types/<int:pk>/",
        views.region_type_detail,
        name="region_type_detail",
    ),
    # Quadrant Types API (admin-gated mutations)
    path("api/quadrant-types/", views.quadrant_types, name="quadrant_types"),
    path(
        "api/quadrant-types/<int:pk>/",
        views.quadrant_type_detail,
        name="quadrant_type_detail",
    ),
    # All other views (patient list, upload, detail, API, etc.) delegated to
    # the maxillo URL config under the 'laparoscopy' instance namespace so that
    # {% url 'laparoscopy:patient_list' %} and request.resolver_match.namespace
    # both resolve correctly to 'laparoscopy'.
    path("", include(("maxillo.app_urls", "maxillo"), namespace="laparoscopy")),
]
