from django import template
from urllib.parse import urlencode

register = template.Library()

@register.simple_tag(takes_context=True)
def pagination_url(context, page_number):
    """
    Build a pagination URL preserving all current query parameters.
    Usage: {% pagination_url page_number %}
    """
    request = context.get('request')
    if not request:
        return f'?page={page_number}'
    
    # Copy current GET parameters
    params = request.GET.copy()
    
    # Update page parameter
    params['page'] = page_number
    
    # Build query string
    query_string = urlencode(sorted(params.items()))
    
    return f'?{query_string}' if query_string else '?'

