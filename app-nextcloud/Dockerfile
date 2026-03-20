FROM nextcloud:31-apache

COPY enbart-app/booked_events_widget /usr/src/nextcloud/custom_apps/booked_events_widget
COPY app-nextcloud/getevent.sh /usr/local/bin/getevent.sh
COPY app-nextcloud/docker/custom-entrypoint.sh /usr/local/bin/custom-entrypoint.sh

RUN chown -R www-data:www-data /usr/src/nextcloud/custom_apps/booked_events_widget
RUN chmod +x /usr/local/bin/getevent.sh /usr/local/bin/custom-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/custom-entrypoint.sh"]
CMD ["apache2-foreground"]
