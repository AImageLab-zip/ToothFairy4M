from django import template
from common.models import FileRegistry

register = template.Library()

@register.filter
def file_type_display(file_type):
    """
    Template filter to get the display name for a file type.
    Usage: {{ some_file_type|file_type_display }}
    """
    return FileRegistry.get_display_name_for_file_type(file_type)

@register.filter
def file_type_display_name(file_obj):
    """
    Template filter to get the display name for a FileRegistry object.
    Usage: {{ file|file_type_display_name }}
    """
    if hasattr(file_obj, 'file_type_display_name'):
        return file_obj.file_type_display_name
    elif hasattr(file_obj, 'file_type'):
        return FileRegistry.get_display_name_for_file_type(file_obj.file_type)
    return str(file_obj)
