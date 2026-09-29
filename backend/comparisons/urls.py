from django.urls import path
from . import views

urlpatterns = [
      path('compare/', views.compare_prompts, name='compare_prompts'),
    path('compare-matrix/', views.compare_matrix, name='compare_matrix'),
    path('models/', views.list_models, name='list_models'),
]