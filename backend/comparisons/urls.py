from django.urls import path
from . import views

urlpatterns = [
    path('compare/', views.compare_prompts, name='compare_prompts'),
]