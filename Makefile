COMPOSE := docker compose

.PHONY: help up rebuild build down restart logs ps web-logs db-logs web-shell db-shell db-mysql manage migrate makemigrations createsuperuser

help:
	@printf "Available targets:\n"
	@printf "  make up              Start containers in detached mode\n"
	@printf "  make rebuild         Rebuild images and start containers\n"
	@printf "  make build           Build images only\n"
	@printf "  make down            Stop and remove containers\n"
	@printf "  make restart         Restart running services\n"
	@printf "  make logs            Follow all service logs\n"
	@printf "  make web-logs        Follow web logs\n"
	@printf "  make db-logs         Follow db logs\n"
	@printf "  make ps              Show container status\n"
	@printf "  make web-shell       Open a shell in the web container\n"
	@printf "  make db-shell        Open a shell in the db container\n"
	@printf "  make db-mysql        Open mysql client inside db container\n"
	@printf "  make migrate         Run Django migrations\n"
	@printf "  make makemigrations  Create Django migrations\n"
	@printf "  make createsuperuser Run Django createsuperuser\n"
	@printf "  make manage ARGS='check'\n"

up:
	@docker network create proxy-net >/dev/null 2>&1 || true
	$(COMPOSE) up -d

rebuild:
	@docker network create proxy-net >/dev/null 2>&1 || true
	$(COMPOSE) up --build -d

build:
	$(COMPOSE) build

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f

web-logs:
	$(COMPOSE) logs -f web

db-logs:
	$(COMPOSE) logs -f db

ps:
	$(COMPOSE) ps

web-shell:
	$(COMPOSE) exec web bash || $(COMPOSE) exec web sh

db-shell:
	$(COMPOSE) exec db bash || $(COMPOSE) exec db sh

db-mysql:
	$(COMPOSE) exec db sh -lc 'mysql -u"$$MYSQL_USER" -p"$$MYSQL_PASSWORD" "$$MYSQL_DATABASE"'

manage:
	$(COMPOSE) exec web python manage.py $(ARGS)

migrate:
	$(COMPOSE) exec web python manage.py migrate

makemigrations:
	$(COMPOSE) exec web python manage.py makemigrations

createsuperuser:
	$(COMPOSE) exec web python manage.py createsuperuser

js-build:
	npm run build:lap

js-watch:
	npm run watch:lap
