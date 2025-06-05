# Blackboard 2.0

Virtual blackboards to spaces without blackboards.

## Overview

The Blackboard app consists of:
* Backend with two Docker images:
  1. A Node.js app (image *blackboard-server*, port 8080 by default) and 
  2. A PostgreSQL database (image *blackboard-db*, port 5432)
* Frontend (lecturer's interface) with one Docker image:
  1. A React web application (image *blackboard-client*, port 4000 by default)

You can test all of these on a single computer using the instructions below. [Usage in production with secured connections](#using-in-production) is also described.

## Prerequisites
You will need these installed.
* Git
* [Docker Desktop](https://www.docker.com/get-started), a recent version recommended
* docker-compose (in production with Docker Stack this is used only to build the images)

Note, that Docker requires local root access.

If not (you get something like "ERROR: Couldn't connect to Docker daemon..." when running docker-run.sh), and you have added yourself into the admin group, you may need to log out and back in for the group settings to refresh.

## Cloning the git repository
The command below creates a subdirectory *blackboard* inside your freshly created directory.
```
git clone git@github.com:AaltoSciComp/blackboard.git
```
From here on, the instructions differ in development/testing and [production](#using-in-production).

# Using in development / testing
In development, running the software is handled by Docker-compose (written in Python), which (re)builds the images, (re)starts the containers, and handles setting up the communication between them in Docker, all according to the configuration in docker-compose.yml (or debug-compose.yml in Blackboard 2.0 as the default file is used in production). When using via debug-run.sh, the app is recompiled and restarted whenever the backend or frontend code changes, so you see the results immediately in most cases. Mainly when adding new external libraries, one needs to remove the old image so they can be found from inside the container.
### Change into the blackboard directory and start the containers
The containers will be created, lots of things downloaded, and packages installed during first run, so it's a good time to grab a coffee or two after these commands.
```
cd blackboard
./debug-run.sh
```
To exit from blackboard, press **ctrl-c** on the console (might need to do this twice, at least with WSL2 on Windows).

Note: the *docker-run.sh* script is meant for production environment. It will build an optimized version of the React App and serve the built (static) content with the *Nginx* web server instead of the development server. Also, instead of *node*, the backend is run using *nodemon*, which reloads the server whenever it detects changes in source files.

## Testing the app
To enter the blackboard main page, open a browser to http://localhost:4000

From here, you can create new presentations, and join existing ones as either a presenter or a viewer. It is mandatory to set a password for presenter when creating the presentation, but for viewers it is optional. Usernames do not exist in Blackboard 2.0, and no external authentication methods are supported. Passwords are not stored as plaintext anywhere, so please remember yours!

The viewers see 1-16 boards at a time, depending on the configuration set by the presenter. By default, navigation is done by the presenter, but viewers can detach from the session and browse the boards using keyboard arrows or on-screen buttons. The browsing is limited to those boards the viewer has "seen", as the data comes from the browser cache in offline mode.

For more about how to use the system, see the documentation under /docs (TODO: Add the link to actual documentation location in GitHub here).

## Upgrading code to the latest version
To get the latest code from git, navigate to the Blackboard root directory type:
```
git pull
```
To make sure you have the latest commits, you can see them (latest first, exit with **q**) by typing:
```
git log
```

Note: if the file **db/init_db.sql** changes, this means the database schema may have changed. This should also be mentioned in the git log descriptions. In the worst case, this means all existing data needs to be removed, but of course these kinds of changes will be avoided.

When upgrading the server, you need (for now) to force remove and recreate the blackboard-server Docker image (Node.js app) like this:
```
docker image rm blackboard-server -f
```
After this command, the image is rebuilt with fresh settings for the backend. The same method can be applied to other containers as well, if they don't seem to get updated.

### Database errors
If you get a database error, the database schema may have changed. In this case, you will need to reinitialize the database volume:
```
docker ps -a
```
This shows you a list of all containers, from which we need the **CONTAINER ID** for our *postgres* container. Type the following commands, where xxxxxxxxxxxxx is the ID above:
```
docker rm xxxxxxxxxxxxx
docker volume rm blackboard_bbdata
```
If the above commands give you no errors, you can run the docker-run.sh again and the database will be reinitialized with an up to date schema.

**Note: if the database schema has changed, you will not be able to restore old backups without modification.**

### Examining the database
If you wish to examine the database contents for debugging, you can enter the command line of the bb-postgres container either via the Docker Desktop control panel (select the option **CLI** of that container), or via a terminal by using the following command:
```
docker exec -it -u root blackboard-db /bin/sh
```
In the container command prompt, give the following command to enter the PostgreSQL client:
```
psql -U blackboard
```
From here, you can proceed with the usual PostgreSQL commands, for example **\d** to show all tables, and to examine data via SQL queries. If you don't want to break anything, use only **SELECT** commands. Remember to put a semicolon (;) to the end of your query, or it will not be executed. You can get online help with the command **\?** or from https://www.postgresql.org/docs/14/app-psql.html

You can exit psql with the command **\q** (or **ctrl-d**), and the container command line with **ctrl-d**.

## Changing default ports
You can change the default ports the application uses by editing the .env file in the main directory. **NODE_PORT_DEV** sets the Node.js (backend) port, and **REACT_APP_PORT** sets the frontend port.

# Using in production
The production environment only uses docker-compose to build the images, while the actual running and configuring is done by Docker (by deploying a stack of services into a swarm). While the development environment is designed to restart and recompile itself when code changes, the production environment aims to run the same code 24/7, over secured connections, and survive server reboots.

Production installation assumes we are running over secure connections with certificates (obtaining these is out of scope of these instructions) for the server. In order to use these securely, we utilize *Docker secrets*, which keep the certificates encrypted in a database handled by Docker. The files are mounted inside container in a memory-only storage under the /run/secrets/ directory. This requires some additional Docker configuration, so read on.

## Setting up Docker swarm mode
Secrets are only available in Swarm mode, so we need to enable it even though we only run one copy of each container. Enable swarm mode on the server by typing:
```
docker swarm init
```

## Setting up Docker secrets
Now we can add secrets for this server, so let's add all the necessary files for setting up the secure communications for both Node.js and Nginx. The certificate file paths will be different for each system, but we will add the certificate itself ("cert"), an intermediate certificate chain, i.e. links between the root CA and server ("ca"), and the server's private key used to create the certificate ("keyfile"):
```
cat /etc/ssl/certs/blackboard.mydomain.com_cert.pem | docker secret create cert -
cat /etc/ssl/certs/blackboard.mydomain.com_interm.cer | docker secret create ca -
cat /etc/ssl/private/blackboard.mydomain.com.key | docker secret create keyfile -
```
We'll define the hostname and backend (Node.js) port also (replace "blackboard.mydomain.com" with your hostname):
```
printf "blackboard.mydomain.com" | docker secret create nginx-host -
```
Finally, let's create the self-made server secret for signing the JWT tokens in Node.js. The your-secret-server-string-here should contain the random string used in the signing process (concatenated with the password hash):
```
printf "your-secret-server-string-here" | docker secret create server-secret -
```
Like the server key, the server-secret should be kept secret. It is a good idea to change it from time to time (ideally this would be done by some automated script like daily/weekly), perhaps combined with [informing the users](#broadcasting-admin-messages) first. Note, that this will invalidate all access tokens, but as the service stack needs to be removed and relaunched to remove/recreate the secret in use, the users would need to log in again anyway. Just don't time it to run during active usage hours. Also if you need to invalidate all tokens for some reason (like vandalism from a laptop left unprotected), this is a good way to do it. It doesn't help if the presentation passwords have been leaked, though.

If you wish to use another port than the default 8080 for the backend (Node.js), you can also define a secret *node-server-port*  (this has not been properly tested yet, though).

## Setting up the .env file
Due to the Docker secrets not being readable during build phase, we need to configure some settings also in the **.env** file in project root. A sample **.env-example** is provided with comments about what the options mean. The variables required for production are:
* NODE_PORT_PROD
* NGINX_PORT
* NGINX_HOST (this needs to be changed to your own hostname, others may typically be left to defaults)

## Running services
In the root level, there is a script "docker-run.sh", which builds and the necessary stack of Docker services, assuming all the secrets described in the previous steps are found from the Docker environment:
```
./docker-run.sh
```
This creates a *stack* of three Docker *services*, one for each container (postgres, client, and server). The stack is simply named "bb" (for blackboard) for brevity, as all the services have this prepended on their name. These services are automatically relaunched by Docker, and should survive a server reboot.
You can check the status of currently running services with:
```
docker service list
```
Pay attention to the REPLICAS column, which should show **1/1** for each service. If this shows **0/1**, it means the service was stopped/restarting for some reason. You can examine the logs of a service with the command (xxxx is the service ID from the service listing):
```
docker service logs xxxx
```

## Broadcasting admin messages
An administrator with access to the Blackboard server can broadcast messages to ALL presenters when there is an urgent need to restart the service or otherwise let everyone know something important. Unlike other messages, these persist in the presenter's screen as long as he/she dismisses them manually, and also show the time of message. To broadcast a message, use a script called **admin.js** in the blackboard-server image (/srv/app/server/src/admin.js):
```
docker ps (find the id of running blackboard-server container)
docker exec -it <container id> sh
cd src
node admin.js message "Sorry, but the server needs to be rebooted. Please check back in 2 minutes"
```
Please give the users a moment to react before shutting down the services.

## Admin commands for modifying existing sessions
Administrators should typically not need to mess with users' sessions, but sometimes a user may forget the presenter password, or some presentation needs to be removed or hidden. This can, of course, be done directly on the database, but there are also some helpful admin commands to make the process less prone to accidents. These are given inside the blackboard-server container, just like the admin.js messages. The command names should be quite self-explanatory, with hidesession.js and showsession.js showing/hiding the session from the front page listing:
```
node chpasswd.js <session_id> <new_password>
node deletesession.js <session_id>
node hidesession.js <session_id>
node showsession.js <session_id>
```

## Stopping services
Please [inform the users](#broadcasting-admin-messages) before stopping services.
To stop all services related to Blackboard, run the following command:
```
docker stack rm bb
```
For convenience, in the same folder as *docker-run.sh*, there is also a shell script *docker-stop.sh*, doing exactly the same thing.

## Upgrading to the latest code version
To get the latest code from git, navigate to the Blackboard root directory type:
```
git pull --recurse-submodules
```
To make sure you have the latest commits, you can see them (latest first, exit with **q**) by typing:
```
git log
```
Before continuing with the update, [inform the users](#broadcasting-admin-messages) and [stop the services]("stopping-services).

In some cases it is enough to just restart the stack. However, as you want to be sure no old code or images are left hanging, the safest way is to prune all old Docker images when containers are removed (by the *docker stack rm bb* in the previous step), resulting in a clean installation:
```
docker image prune -a
./docker-run
```

## Backing up data
For doing just a quick, single sql dump, you need the id of the currently running blackboard-db container, which you can get with a command:
```
docker ps
```
In the example below, *26d50616772b* is the ID of the running postgres container, and the database dump will be saved in the directory you are in.
```
docker exec -t 26d50616772b pg_dumpall -c -U blackboard > dump_`date +%d-%m-%Y"_"%H_%M_%S`.sql
```

**Remember to backup the backup files so that your data is not in one filesystem only!**

## Restoring data from backup
**NOTE: If the system is running, [inform the users](#broadcasting-admin-messages) and give them time to save their work before restoring a database dump, as this will destroy presentations currently in progress, if they are not saved before the dump was taken!**

The blackboard-db container needs to be running in order to restore data. On the host machine, navigate to the folder containing the backup you want to restore (by default under /root/backups) 
An example of the restore command is below. Here *dump_2022-05-12_17_24_10.sql* is the sql dump file, and *26d50616772b* is the ID of the running postgres container (use *docker ps* to get the id like above).
```
cat dump_2022-05-12_17_24_10.sql | docker exec -i 26d50616772b psql -U blackboard
```

**IMPORTANT:** After restoring the backup, you'll need to restart at the backend in order to avoid duplicate database ids when new data is inserted. As the restore process is (hopefully) not needed very often, the easiest option is just to remove and recreate the whole service stack:
```
docker stack rm bb
./docker-run.sh
```

## Updating server certificates
First, obtain the new certificate. To update them as Docker secrets, you first need to stop the stack of services like above:
```
docker stack rm bb
```
Docker secrets are not mutable (at the time of writing, at least), so you need to remove the existing certificate-related secrets (ca and keyfile only if they have changed):
```
docker secret rm cert ca keyfile
```
After this, [create the new certificate-related secrets](#setting-up-docker-secrets), and restart the stack using the docker-run.sh script.

## Examining the database
To enter the psql database shell, check the blackboard-db container id using **docker ps** and then enter the following commands (replace 26d50616772b with your container id):
```
docker exec -i 26d50616772b /bin/sh
psql -U blackboard
```
*(Note: you can use **docker exec -i 26d50616772b psql -U blackboard** for quicker access, but lose the shell features like browsing the previous commands using up arrow)*

## Testing the app
To enter the Blackboard main page, open a browser to https://replace.with.your.hostname

From here, you can create new presentations, and join existing ones as either a presenter or a viewer. It is mandatory to set a password for presenter when creating the presentation, but for viewers it is optional. Usernames do not exist in Blackboard 2.0, and no external authentication methods are supported. Passwords are not stored as plaintext anywhere, so please remember yours!

The viewers see 1-16 boards at a time, depending on the configuration set by the presenter. By default, navigation is done by the presenter, but viewers can detach from the session and browse the boards using keyboard arrows or on-screen buttons. The browsing is limited to those boards the viewer has "seen", as the data comes from the browser cache in offline mode.

For more about how to use the system, see the documentation under /docs (TODO: Add the link to actual documentation location in GitHub here).

## Server OpenAPI documentation/validation
All calls to the API endpoints on the Node.js server are validated against the server OpenAPI specification, which can be found at /server/src/blackboard_openapi.json. The file can be browsed directly in GitLab, by copy-pasting to https://editor.swagger.io/, or by using local developer tools like VS Code (using the Swagger Viewer extension, for example).
Important: If you change the server API, you *need to update the specification* accordingly.

NOTE: names of properties which only exist as JSON fields (like strokeWidth and radiusX) are written in lowerCamelCase, while the properties that are actual SQL fields (like shapetype and starttime) are named in lowercase. The distinction between these is based on which fields we need to write SQL queries against (like which board colors have been used in a given presentation), and which are just Konva properties we need at draw time (like the radius of a single circle, or whether we want to only use pen for drawing).

## Websocket messages documentation
Documentation for messages passed through websockets are documented in /server/public/asyncapi/. In a development environment, you can access this documentation via http://localhost:8080/asyncapi/. This documentation contains:
* OPERATIONS/PUB: websocket messages sent by the server
* OPERATIONS/SUB: websocket messages received by the server
* SCHEMAS: description of the format for each message type

TODO: add tools for regenerating the AsyncAPI documentation when there are changes in message formats

# Additional notes / gotchas
* The name of the volume containing the Blackboard database is *"blackboard_bbdata"* when running in development (with docker-compose), and *"bb_bbdata"* when running in production with Docker stack/swarm (assuming you have named the stack *"bb"*).
* Logs can be examined from both the Docker services (docker service logs xxx, xxx being the *service name*), as well as containers (docker logs yyy, yyy being the *container ID*). These may not be identical, so when looking for issues, be sure to check them both.
* The PostgreSQL image runs in the default port (5432), so if you need to change this for some reason, you'll need to edit the /server/src/server.js file and rebuild the images.
* Yes, in production the hostname needs to be configured to both Docker secrets (for runtime) and the .env file (for building). Feel free to suggest a better way to handle this.

# License

Blackboard 2.0 – Virtual blackboards to spaces without blackboards.
Copyright (C) 2025 Aalto University.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.`