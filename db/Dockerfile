FROM postgres:14
# Define build-time arguments
ARG TZ
# Set environment variables
ENV TZ=${TZ}
# Copy initialization script
COPY ./data/init_db.sql /docker-entrypoint-initdb.d/