#!/bin/bash

case "$1" in
  start)
    docker-compose up -d
    echo "Services starting..."
    sleep 5
    docker-compose ps
    ;;
  stop)
    docker-compose down
    ;;
  restart)
    docker-compose restart
    ;;
  logs)
    docker-compose logs -f "${2:-n8n}"
    ;;
  clean)
    docker-compose down -v
    echo "Volumes removed"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|logs|clean} [service]"
    exit 1
    ;;
esac
