from django.urls import path
from . import views

urlpatterns = [
    path('', views.scan_list, name='scan_list'),
    path('home/', views.home, name='home'),
    path('upload/', views.upload_scan, name='upload_scan'),
    path('scan/<int:scanpair_id>/', views.scan_detail, name='scan_detail'),
    path('scan/<int:scanpair_id>/update/', views.update_classification, name='update_classification'),
    path('scan/<int:scanpair_id>/update-name/', views.update_scan_name, name='update_scan_name'),
    path('scan/<int:scanpair_id>/voice-caption/', views.upload_voice_caption, name='upload_voice_caption'),
    path('scan/<int:scanpair_id>/voice-caption/<int:caption_id>/delete/', views.delete_voice_caption, name='delete_voice_caption'),
    
    # API endpoints
    path('api/scan/<int:scanpair_id>/data/', views.scan_viewer_data, name='scan_viewer_data'),
    path('api/scan/<int:scanpair_id>/cbct/', views.scan_cbct_data, name='scan_cbct_data'),
] 