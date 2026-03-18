FROM nextcloud:31-apache

COPY apps/booked_events_widget /usr/src/nextcloud/custom_apps/booked_events_widget

RUN chown -R www-data:www-data /usr/src/nextcloud/custom_apps/booked_events_widget
