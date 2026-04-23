from django.contrib import admin

from .models import (
    LaparoscopyPatient,
    QuadrantClassificationMarker,
    RegionAnnotation,
    QuadrantType,
    QuadrantTypeUserColor,
    RegionType,
    RegionTypeUserColor,
)


@admin.register(LaparoscopyPatient)
class LaparoscopyPatientAdmin(admin.ModelAdmin):
    list_display = [
        "patient_id",
        "name",
        "project",
        "visibility",
        "uploaded_at",
        "uploaded_by",
    ]
    list_filter = ["visibility", "uploaded_at"]
    search_fields = ["patient_id", "name", "uploaded_by__username"]
    readonly_fields = ["patient_id", "uploaded_at"]
    ordering = ["-uploaded_at"]

    def get_queryset(self, request):
        return super().get_queryset(request).filter(project__slug="laparoscopy")

    def has_add_permission(self, request):
        return False


@admin.register(RegionType)
class RegionTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "color", "order"]
    list_filter = ["project"]
    search_fields = ["name", "project__name", "project__slug"]
    ordering = ["project__name", "order", "name"]
    list_editable = ["color", "order"]


@admin.register(QuadrantType)
class QuadrantTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "color", "order"]
    list_filter = ["project"]
    search_fields = ["name", "project__name", "project__slug"]
    ordering = ["project__name", "order", "name"]
    list_editable = ["color", "order"]


@admin.register(RegionTypeUserColor)
class RegionTypeUserColorAdmin(admin.ModelAdmin):
    list_display = ["user", "region_type", "color"]
    list_filter = ["region_type__project"]
    search_fields = [
        "user__username",
        "region_type__name",
        "region_type__project__name",
    ]


@admin.register(QuadrantTypeUserColor)
class QuadrantTypeUserColorAdmin(admin.ModelAdmin):
    list_display = ["user", "quadrant_type", "color"]
    list_filter = ["quadrant_type__project"]
    search_fields = [
        "user__username",
        "quadrant_type__name",
        "quadrant_type__project__name",
    ]


@admin.register(RegionAnnotation)
class RegionAnnotationAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "patient",
        "region_type",
        "tool",
        "frame_time",
        "created_by",
        "updated_by",
        "updated_at",
    ]
    list_filter = ["tool", "region_type__project", "created_at"]
    search_fields = [
        "patient__name",
        "patient__patient_id",
        "region_type__name",
        "created_by__username",
        "updated_by__username",
    ]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(QuadrantClassificationMarker)
class QuadrantClassificationMarkerAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "patient",
        "quadrant_type",
        "time_ms",
        "created_by",
        "updated_by",
        "updated_at",
    ]
    list_filter = ["quadrant_type__project", "quadrant_type", "created_at"]
    search_fields = [
        "patient__name",
        "patient__patient_id",
        "quadrant_type__name",
        "created_by__username",
        "updated_by__username",
    ]
    readonly_fields = ["created_at", "updated_at"]
