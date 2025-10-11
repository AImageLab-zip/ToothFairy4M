from django.apps import AppConfig


class MaxilloConfig(AppConfig):
	default_auto_field = "django.db.models.BigAutoField"
	name = "maxillo"
	label = "scans"

	def ready(self):
		import maxillo.signals
