from django.contrib import admin
from .models import BrainUserProfile

@admin.register(BrainUserProfile)
class BrainUserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    search_fields = ('user__username', 'user__email')
    list_filter = ('role',)
