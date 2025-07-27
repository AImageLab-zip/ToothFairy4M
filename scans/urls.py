from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('register/', views.register, name='register'),
    path('scans/', views.scan_list, name='scan_list'),
    path('upload/', views.upload_scan, name='upload_scan'),
    path('scan/<int:scanpair_id>/', views.scan_detail, name='scan_detail'),
    path('scan/<int:scanpair_id>/update/', views.update_classification, name='update_classification'),
    path('scan/<int:scanpair_id>/update-name/', views.update_scan_name, name='update_scan_name'),
    path('api/scan/<int:scanpair_id>/data/', views.scan_viewer_data, name='scan_viewer_data'),
] 