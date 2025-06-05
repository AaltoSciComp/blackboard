GRANT ALL PRIVILEGES ON DATABASE "blackboard" to blackboard;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cbsessions(
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    viewerpw TEXT,
    presenterpw TEXT,
    sessionname TEXT, 
    ispublic BOOLEAN, 
    lastlogin TIMESTAMP,
    lastview TIMESTAMP,
    settings JSONB
);

CREATE TABLE IF NOT EXISTS boards(
    id INTEGER,
    sessionid INTEGER,
    bgcolor VARCHAR(7),
    settings JSONB,
    PRIMARY KEY(id, sessionid)
);

CREATE TABLE IF NOT EXISTS shapes(
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    sessionid INTEGER,
    boardid INTEGER,
    visible BOOLEAN,
    starttime BIGINT,
    erasetime BIGINT,
    shapetype TEXT, 
    x NUMERIC(5,4),
    y NUMERIC(5,4),
    stroke VARCHAR(7),
    fill VARCHAR(7),
    shapedetails JSONB,
    shapedata JSON
);