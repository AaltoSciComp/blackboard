const { Pool } = require('pg')
const { jsPDF } = require("jspdf"); // will automatically load the node version
const simplify = require('simplify-js');
const fs = require('fs');
const bcrypt = require('bcrypt');
const logger = require('npmlog');
const errorHandlerMiddleware = require("./error-handler.js");
const createHttpError = require("http-errors");
const OpenApiValidator = require('express-openapi-validator');
const { CERTPATHS, DEF_BOARD, DEF_UI } = require('./constants.js');
const { pdf_drawLine, pdf_makeKonvaGrid } = require('./pdf_utils.js');

// Using the default psql port 5432, need to specify new port here if changed
const pool = new Pool({
    user: 'blackboard',
    host: 'blackboard-db',
    database: 'blackboard',
    password: 'blackboard'
})

if (process.env.NODE_ENV !== 'production') {
    // load util for local debugging only
    var util = require('util')
}

// Constants
var server;             // future server object, either http or https
var io;                 // socket.io object
var SERVER_SECRET;      // secret to use with signing JTW tokens

// Node port is set in .env file in both dev and prod, and defaults to 8080 if not
const NODE_SERVER_PORT = process.env.NODE_SERVER_PORT ?? 8080;

Object.defineProperty(logger, 'heading', { get: () => { return new Date().toUTCString() } })
logger.headingStyle = { bg: '', fg: 'white' }

if (process.env.NODE_ENV !== 'production') {
    // SERVER_SECRET can be set in .env file in development, but defaults to "blackboard-super-secret-pwd"
    SERVER_SECRET = process.env.SERVER_SECRET ?? 'blackboard-super-secret-pwd';
    logger.level = 'info';
} else {
    logger.level = 'warn';
    // Read the server secret from Docker secrets in production, and exit if not defined
    SERVER_SECRET = fs.readFileSync(`/run/secrets/server-secret`, 'utf8');
    if(!SERVER_SECRET) {
        logger.error('You need to specify server-secret in Docker secrets');
        process.exit(1);
    }
 
    // Check that we have cert files added as Docker secrets
    fs.stat(CERTPATHS.cert, (err, stats) => {
        if (err) {
          logger.error('filesystem access issue', err);
          process.exit(1);
        }
        if(stats.isFile() && stats.size > 0) {
            // all good...
            logger.info('Certificate file seems ok at ' + CERTPATHS.cert);
        } else {
            logger.error('Certificate file not found!');
            process.exit(1);
        }
    })

    fs.stat(CERTPATHS.ca, (err, stats) => {
        if (err) {
            logger.error('filesystem access issue', err);
            process.exit(1);
        }
        if(stats.isFile() && stats.size > 0) {
            // all good...
            logger.info('Intermediate certificate file seems ok at ' + CERTPATHS.cert);
        } else {
            logger.error('Intermediate certificate file not found!');
            process.exit(1);
        }
    })
    
    fs.stat(CERTPATHS.key, (err, stats) => {
        if (err) {
            logger.error('filesystem access issue', err);
            process.exit(1);
        }
        if(stats.isFile() && stats.size > 0) {
            // all good...
            logger.info('Key file seems ok at ' + CERTPATHS.key);
        } else {
            logger.error('Key file not found!');
            process.exit(1);
        }
    })
}

process.on('unhandledRejection', (reason, promise) => {
    const error = createHttpError.InternalServerError(`${reason.stack ?? reason}`);
    return next(error);
})

var sd = []; // session-specific data
var bds = []; // boards data

var presenterCheck;

// App
const express = require('express');
const cors = require('cors')
const jwtkn = require('jsonwebtoken');
const app = express();

// Cache OPTIONS requests results in the browser to avoid unnecessary requests
app.use(cors({ 
    credentials: true, 
    maxAge: 86400, // 24 hours, capped to 2 hours in Chromium
    preflightContinue: true // Allow us to manually add to preflights
 }));

/**
 * Use https in production, http in development
 * 
 * connectionStateRecovery is new for Socket.io 4.6
 */
if (process.env.NODE_ENV !== 'production') {
    server = require('http').createServer(app);
    io = require('socket.io')(server, {connectionStateRecovery: {
        // default values
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
      },});
} else {
    server = require('https').createServer({
        key: fs.readFileSync(CERTPATHS.key),
        cert: fs.readFileSync(CERTPATHS.cert),
        ca: fs.readFileSync(CERTPATHS.ca)
    }, app);
    io = require('socket.io')(server, {
        secure: true, 
        connectionStateRecovery: {
            // default values
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: true,
        }
    });
}

app.use(express.static('public', {
    etag: false
}));

app.use(express.json({limit:'1mb'})); // default is 100kb, may prevent drawing longer lines
//app.disable('view cache'); // debug only
app.disable('x-powered-by'); // Don't encourage targeted attacks towards Node/Express platform

function readableTime(t) {
    const date = new Date(t);
    return date.toLocaleTimeString("fi-FI");
}

var presenterCheck = setInterval(() => checkPresenterConnection(), 10000);

async function getBoard(sid, boardId) {
    if(!boardId || !sid) {
        logger.warn('getBoard', 'boardid (' + boardId + ') or id (' + sid + ') is empty!');
        return;
    }
    const boarddata = await pool.query(`select bgcolor, settings from boards WHERE sessionid = $1 and id = $2`, [sid, boardId]);
    const shapedata = await pool.query(`select id, boardid, stroke, fill, starttime, x, y, shapetype, shapedetails, shapedata from shapes WHERE sessionid = $1 and boardid = $2 AND visible = 't' ORDER BY starttime asc;`, [sid, boardId]);
    if(boarddata.rows[0]) {
        // Add color property inside settings so the format is similar to client end
        const settings = boarddata.rows[0].settings;
        settings['color'] = boarddata.rows[0].bgcolor;
        return { boardid: boardId, settings: settings, data: shapedata.rows }
    } else {
        return { boardid: boardId, settings: null, data: null }
    }
}

const updateSessionCache = async (sid) => {
    try {
        const { rows } = await pool.query(`select * from cbsessions WHERE id = $1;`, [sid]);
        
        if (rows.length === 1) {
            if(!sd[sid]) sd[sid] = {}; // Initialize cache item if not present
            sd[sid].presenterhash = rows[0].presenterpw; 
            sd[sid].viewerpw = rows[0].viewerpw;
            sd[sid].sessionid = rows[0].id;
            sd[sid].sessionname = rows[0].sessionname;
            sd[sid].ispublic = rows[0].ispublic;
            sd[sid].settings = rows[0].settings;
            //logger.verbose(sd[sid]);
            return true;
        } else {
            return false;
        }
    } catch (error) {
        logger.error('updateSessionCache', error);
        return false;
    }
}

/**
 * Check if token qualifies as admin
 * @param {string} token - JWT token to verify
 * @returns {Promise<boolean>} - Resolves to true if admin, false otherwise
 */
const isAdmin = async (token) => {
    if (!token || token === 'null') {
        throw new Error('Invalid or missing token!');
    }

    try {
        const decoded = await jwtkn.verify(token, SERVER_SECRET);
        return decoded.role === 'admin';
    } catch (err) {
        logger.error('isAdmin: Token verification failed', err);
        return false;
    }
};

/**
 * Check if token qualifies as presenter for the given session
 * @param {integer} sid session id to use
 * @param {string} token jwt token to verify
 * @returns boolean true if logged in as presenter, false otherwise
 */
const isPresenter = async (sid, token, next) => {
    logger.verbose('token to presenter-check: ' + token);
    if(!sid) {
        logger.error('isPresenter','missing session id');
        throw new Error('Presentation id was not given!');
        //return false;
    }
    if(!sd[sid]) {
        logger.info('isPresenter: missing entry in session table, fetching session ' + sid);
        // Get session info to cache so we are ready the next time TODO: remove this and do better
        const sessionfound = await updateSessionCache(sid);
        if(!sessionfound) {
            logger.error('isPresenter:','Presentation was not found');
            //const error = new createHttpError.BadRequest("Presentation was not found");
            //throw new Error('Presentation was not found');
            //return false; // TODO: Inform the user somehow about missing session...
            return Promise.resolve(false);
        }
    }
    if (!token || token === 'null') {
        throw new Error('Invalid or missing token!');
    }
    logger.verbose('isPresenter','hash: ', sd[sid].presenterhash, ', token: ', token);

    try {
        const decoded = await jwtkn.verify(token, sd[sid].presenterhash + SERVER_SECRET);
        return decoded.role === 'presenter';
    } catch (err) {
        logger.error('isPresenter: Token verification failed', err);
        return false;
    }
}


// Helper function to get rid of the "Bearer " in front of tokens in header
function parseToken(token) {
    return token.replace("Bearer ", "");
}

function getMod(sid,bid) {
    if(typeof(bds[sid]) === 'undefined') {
        return false;
    } else {
        if(typeof(bds[sid][bid]) === 'undefined') {
            return false;
        } else {
            return bds[sid][bid].mod;
        }
    }
}

function setMod(sid, bid, mod) {
    logger.verbose('setmod: ' + bid + mod);
    if(typeof(bds[sid]) === 'undefined') {
        logger.verbose('setMod: zeroing ' + bid);
        bds[sid] = [];
    }
    if(bid && mod) { // these may be null when initializing
        logger.verbose('setMod', bid, ' setMod: setting to ', mod);
        bds[sid][bid] = {...bds[sid][bid], mod: mod};
    }
}

/**
 * Get the cached time of last fresh data sent of a given board
 * @param {integer} sid session id
 * @param {integer} bid board id
 */
function getSent(sid,bid) {
    if(typeof(bds[sid]) === 'undefined') {
        return false;
    } else {
        if(typeof(bds[sid][bid]) === 'undefined') {
            return false;
        } else {
            return bds[sid][bid].sent;
        }
    }
}

/**
 * Set the cached time of last fresh data sent of a given board
 * @param {integer} sid session id
 * @param {integer} bid board id
 * @param {timestamp} sent when this board was last sent to clients
 */
function setSent(sid, bid, sent) {
    if(typeof(bds[sid]) === 'undefined') {
        logger.verbose('setSent: zeroing ' + bid);
        bds[sid] = [];
    }
    if(bid && sent) { // these may be null when initializing
        logger.verbose(bid, ' setSent: setting to ', sent);
        bds[sid][bid] = {...bds[sid][bid], sent: sent};
    }
}

/**
 * Helper function to fetch the necessary boards when the visible boards change,
 * either due to moving between boards, or when changing the visible amount
 * 
 * @param {integer} ssid Session id
 * @param {integer} oldstart Old starting board of the view
 * @param {integer} newstart New starting board of the view
 * @param {integer} oldnvb Old number of shown boards
 * @param {integer} newnvb New number of shown boards
 */
function fetchNewlyRevealedBoards(ssid, oldstart, newstart, oldnvb, newnvb) {
    // Create arrays of old an new visible boards
    const oldVisibleBoards = Array.from({length: oldnvb}, (_, i) => i + oldstart)
    const newVisibleBoards = Array.from({length: newnvb}, (_, i) => i + newstart)
    logger.verbose('oldVisibleBoards: ', oldVisibleBoards);
    logger.verbose('newVisibleBoards: ', newVisibleBoards);
    // Check which elements of the new array are not in the old and fetch those
    let difference = newVisibleBoards.filter(x => !oldVisibleBoards.includes(x));
    difference.forEach((b) => fetchBoardData(ssid, b));
    //logger.verbose('difference: ', difference);
    // Then check which of the boards that remain in the view have changes since last sent
    let checkforchanges = newVisibleBoards.filter(x => !difference.includes(x));
    checkforchanges.forEach((b) => {
        const mod = getMod(ssid, b);
        const sent = getSent(ssid, b);
        logger.verbose('b:', b, 'mod:', readableTime(mod), 'sent:', readableTime(sent));
        // If we have not sent the board or it has been modified, fetch and send the data
        if(!sent || (sent < mod)) {
            fetchBoardData(ssid, b)
        }
    });
}

/**
 * Check if token is valid for current password
 * @param {integer} sid session id to use
 * @param {string} token jwt token to verify
 * @returns boolean true if logged in (presenter or not), false otherwise
 */
function isLogged(sid, tkn) {
    if(!tkn || !sid) return false;
    const token = parseToken(tkn);
    logger.verbose('token to check: ' + token);
    try { 
        const verified = jwtkn.verify(token, sd[sid].viewerpw + SERVER_SECRET);
        return (verified.role === 'presenter' || verified.role === 'viewer');
    } catch(e) {
        logger.verbose(tkn);
        logger.info('Error occurred in json token verification: ' + e);
        return false;
    }
}

/**
 * Initialize a single board. Requests the board and its contents from DB
 * and emits events for all clients in the room (session).
 * 
 * @param {integer} id session id to use
 * @param {int} boardId Board id to initialize
 */
function fetchBoardData(id, boardId) {
    const sid = parseInt(id);
    const bid = parseInt(boardId);
    logger.verbose('board ' + bid + ' requested for session ' + sid);
    var mod = getMod(sid,bid);
    if(!mod) {
        logger.verbose('not found in cache: ' + sid + '/' + bid);
        mod = Date.now();
    }
    if(sid > 0 && bid > 0) {
        setMod(sid, bid, mod);
        getBoard(sid, bid).then(results => {
            // Send board data to all clients regardless of whether they asked for it
            io.to(sid.toString()).emit('board_data', {mod: mod, data: results});
            setSent(sid,bid,Date.now()); // update sent time to local cache
        }).catch(err => {
            logger.error('fetchBoardData: ', err);
        });
    } else {
        logger.error('fetchBoardData: boardid (' + bid + ') or id (' + sid + ') not given!');
        return;
    }
}

/**
 * Check if presenter is still connected to server via websocket
 * and emit a presenter_disconnected message if not
 */
function checkPresenterConnection() {
    sd.forEach( (session) => {
        if(session.presentersocket !== undefined && session.presentersocket.connected) {
            logger.verbose(bds[session.id]);
            // carry on...
        } else {
            if(session.id) {
                io.to(session.id.toString()).emit('presenter_disconnected');
            }
            session.presentersocket = undefined;
        }
    })
}

/**
 * Sign a new JWT token.
 * Note: you need to make sure the user has given a correct password before calling this
 * 
 * @param {string} pw Password to use for signing token
 * @param {string} role Role to assign for the token
 * @returns {string} signed token, or null if failed
 */
function signToken(pw, role="viewer") {
    let presenter = false;
    const secret = pw + SERVER_SECRET;
    if(role === "presenter") {
        presenter = true;
    }
    if(typeof(pw) === 'undefined') return null;
    try {
        const token = jwtkn.sign({ role: (presenter ? "presenter" : "viewer") }, secret);
        return token;
    }
    catch(error) {
        logger.error('signToken: ', error);
        return null;
    }
}

/**
 * Event handler for any incoming socket.io connections
 * 
 * Connecting via socket.io is open for all clients, but all event emissions 
 * require a valid JWT token with at least "viewer" role. Most of the events
 * can only be sent with the "presenter" role (i.e. by the teacher).
 * 
 * The only exception is "viewer_login", which requires the current password
 * to be sent, and returns the token for sending further events.
 */
io.on('connection', function (socket) {

    socket.on('admin_notification', async (json) => {
        if(isAdmin(json.token)){
            const timenow = readableTime(Date.now());
            io.emit('admin_notification', timenow + ': ' + json.message);
            logger.info(timenow, ' Broadcasted admin notification: ', json.message);
        } else {
            logger.error(timenow, ' Tried to broadcast admin notification with invalid token: ', json.message);
        }
    });

    // Disconnect and close socket when client disconnects
    socket.on('disconnecting', (reason) => {
        logger.verbose('disconnecting socket',socket.id);
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                socket.to(room).emit('viewer_count', (io.sockets.adapter.rooms.get(room).size - 1));
            }
        }
      
        //logger.verbose(socket);
        //let room = socket.rooms.values().next().next().value;
        //logger.verbose(room);
        //socket.disconnect();
        // TODO: if one can get the room of disconnected socket somehow,
        // here is a good place to emit info about it... so now we only get updates
        // when a new client joins.
        //io.to(rooms.toString()).emit('viewer_count', io.engine.clientsCount - 1);
    });

    //logger.verbose('got a call!' + util.inspect(socket.conn));
    /**
     * Event viewer_login is sent first by any new client requesting access
     * to the grid view. If the password is correct, a token is given to client.
     */
    socket.on('viewer_login', async (json) => {
        const sid = parseInt(json.sid);
        const offset = parseInt(json.offset);
        let sessionfound;
        // The session data for this id may not yet be in server cache, in which case load it from db
        if(sid > 0) {
            if(typeof(sd[sid]) === 'undefined') {
                sessionfound = await updateSessionCache(sid);
                if(!sessionfound) {
                    logger.info('viewer_login: Session data not found');
                    socket.emit('login_failed', 'Session data not found');
                    return;
                }
            } else {
                if(typeof(sd[sid].settings) === 'undefined') {
                    sessionfound = await updateSessionCache(sid);
                    if(!sessionfound) {
                        logger.info('viewer_login: Session settings not found');
                        socket.emit('login_failed', 'Session settings not found');
                        return;
                    }
                }
            }
            if (json.pw === sd[sid].viewerpw) {
                // Generate an access token
                const accessToken = signToken(sd[sid].viewerpw);
                socket.join(sid.toString());
                logger.verbose('viewer_login',{ nvb: sd[sid].settings.nvb, ab: sd[sid].settings.ab, sb: sd[sid].settings.sb});
                socket.emit('login_success', { nvb: sd[sid].settings.boards.nvb, ab: sd[sid].settings.boards.ab, sb: sd[sid].settings.boards.sb, defaultBoardColor: sd[sid].currentBoardSettings?.color ?? DEF_BOARD.color, token: accessToken});
                pool.query(`
                update cbsessions set lastview = now() where id = $1;
                `, [sid], (q_err, q_res) => {
                    if (q_err) {
                        logger.error(q_err.stack);
                    }
                })
                //logger.verbose(sd[sid]);
                logger.info('viewer logged in succesfully to session ' + sid);
                // Only emit viewer count to presenter
                if(sd[sid].presentersocket !== undefined) {
                    sd[sid].presentersocket.emit('viewer_count', io.sockets.adapter.rooms.get(sid.toString()).size - 1);
                }

                // Take the possible offset into account when sending the initial boards to viewer
                let startFrom = sd[sid].settings.boards.sb + (offset * sd[sid].settings.boards.nvb);
                // Starting board cannot be negative though...
                if(startFrom < 0) startFrom = 1;

                for (var i = startFrom; i < startFrom + sd[sid].settings.boards.nvb; i++) {
                    logger.verbose('fetching sid: ', sid, ', i: ', i);
                    fetchBoardData(sid, i)
                }
            } else {
                socket.emit('login_failed', 'Incorrect password: ' + json.pw);
                logger.warn('Viewer login failed: incorrect password');
                logger.verbose(sd);
                socket.disconnect();
            }
        } else {
            logger.info('Session id not present');
        }
    });

    /**
     * Any client with a valid token can request a range of boards
     * by the request_boards command.
     */
    socket.on('request_boards', function (json) {
        const sid = parseInt(json.sid);
        if(sid > 0) {
            if(isLogged(sid, json.token) !== undefined) {
                for (var i = json.from; i <= json.to; i++) {
                    logger.verbose('request_boards: also fetching sid: ', sid, ', i: ', i);
                    fetchBoardData(sid, i)
                }
            } else {
                logger.warn('request_boards: not authenticated');
                socket.emit('login_failed', 'Not authenticated');
            }
        } else {
            logger.info('Session id not present');
        }
    });

    /**
     * Only one socket per server instance can act as presenter (use blackboard UI)
     * If presentersocket is already defined and still connected, refuse any attempts
     * to claim board ownership.
     */
    socket.on('claim_board', function (json) {
        const sid = parseInt(json.sid);
        if(isNaN(sid)) {
            socket.emit('fatal_error', 'Presentation id missing');
            logger.warn('claim_board: missing session id');
            return;
        }
        if(isPresenter(sid, json.token)){
            if(sd[sid].presentersocket !== undefined) {
                if(sd[sid].presentersocket.connected) {
                    logger.warn('Failed to claim board presenter status: already claimed');
                    socket.emit('fatal_error', 'Board already claimed');
                    //res.redirect('/viewer.html');
                    //socket.disconnect();
                } else {
                    sd[sid].presentersocket = socket;
                    socket.join(sid.toString());
                    io.to(sid.toString()).emit('presenter_connected');
                    io.to(sid.toString()).emit('viewer_count', io.sockets.adapter.rooms.get(sid.toString()).size - 1);
                    logger.info('Successfully claimed board presenter status');
                    //clearInterval(presenterCheck);
                    //presenterCheck = setInterval(() => checkPresenterConnection(), 5000);
                }
            } else {
                sd[sid].presentersocket = socket;
                socket.join(sid.toString());
                io.to(sid.toString()).emit('presenter_connected');
                io.to(sid.toString()).emit('viewer_count', io.sockets.adapter.rooms.get(sid.toString()).size - 1);
                logger.info('Successfully claimed board presenter status');
                //clearInterval(presenterCheck);
                //presenterCheck = setInterval(() => checkPresenterConnection(), 5000);
            }
        } else {
            logger.warn('claim_board: Presenter credentials required');
            socket.emit('fatal_error', 'Presenter credentials required');
        }
        logger.verbose(sd)
    });
    
    /**
     * Send a global reconfigure_boards event for all grid views.
     * This causes them to destroy and recreate any boards they have.
     * 
     * Only allowed for presenter (teacher).
     */
    socket.on('reconfigure_boards', function (json) {
        const sid = parseInt(json.sid);
        if(sid > 0) {
            if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
                fetchNewlyRevealedBoards(sid, sd[sid].settings.sb, json.sb, sd[sid].settings.nvb, json.nvb);
                if(typeof(sd[sid].settings.boards) === 'undefined') {
                    // Initialize boards settings if not present for some reason
                    sd[sid].settings[boards] = {};
                }
                sd[sid].settings.boards.ab = json.ab;
                sd[sid].settings.boards.sb = json.sb;
                sd[sid].settings.boards.nvb = json.nvb;
                io.to(sid.toString()).emit('reconfigure_boards', sd[sid].settings.boards );
            } else logger.warn('reconfigure_boards: not presenter');
        } else {
            logger.warn('reconfigure_boards: Session id not present');
        }
    });

    // Draw partial shapes directly from presenter json
    socket.on('draw_partial_shape', function (json) {
        const sid = parseInt(json.sid);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            delete json.token; // do not pass tokens
            io.to(sid.toString()).emit('draw_partial_shape', json);
        } else logger.warn('play_shapes: not presenter');
    });

    /**
     * Inform the grid views to replay shapes on a board.
     * 
     * Only allowed for presenter (teacher).
     * NOTE: Be sure not to pass the received json forward as such, as it contains the presenter token !!!
     */
    socket.on('play_shapes', function (json) {
        const sid = parseInt(json.sid);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            io.to(sid.toString()).emit('play_shapes', {boardid: json.boardid, data: json.data, options: json.options});
        } else logger.warn('play_shapes: not presenter');
    });

    socket.on('laserloc', function (json) {
        const sid = parseInt(json.sid);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            io.to(sid.toString()).emit('laserloc', {b: json.b, x: json.x, y: json.y});
        } else logger.warn('laserloc: not presenter');
    });

    socket.on('laser_on', function (json) {
        const sid = parseInt(json.sid);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            io.to(sid.toString()).emit('laser_on', {color: json.color, size: json.size});
        } else logger.warn('laser_on: not presenter');
    });

    socket.on('laser_off', function (json) {
        const sid = parseInt(json.sid);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            io.to(sid.toString()).emit('laser_off');
        } else logger.warn('laser_off: not presenter');
    });

    /**
     * Inform the grid views of moving into another board id.
     * 
     * Only allowed for presenter (teacher).
     */
    socket.on('set_active_board', function (json) {
        const sid = parseInt(json.sid);
        if(isNaN(sid)) {
            logger.info('set_active_board: Session id is NaN');
            return;
        }
        if(typeof(sd[sid]) === 'undefined') {
            logger.warn('set_active_board: Session data not found');
            return;
        }
        logger.verbose(sd[sid]);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            // Send the old active board again, in case there are changes to it (TODO: be more efficient)
            if(Number.isInteger(sd[sid].settings.ab)) {
                fetchBoardData(sid, sd[sid].settings.ab);
            }
            if(sd[sid].settings.boards.sb !== json.startId) { // view starting board has changed
                fetchNewlyRevealedBoards(sid, sd[sid].settings.boards.sb, json.startId, sd[sid].settings.boards.nvb, sd[sid].settings.boards.nvb);
            }
            sd[sid].settings.boards.ab = json.boardId;
            sd[sid].settings.boards.sb = json.startId;
            var mods = [];
            for(var i=0;i < sd[sid].settings.boards.nvb; i++) {
                mods[i] = getMod(sid,sd[sid].settings.boards.sb + i) ?? Date.now();
            }
            io.to(sid.toString()).emit('set_active_board', {ab: json.boardId, sb: json.startId, nvb: sd[sid].settings.boards.nvb, mods: mods});
            logger.verbose('emitting to ' + sid.toString() + ': ab' + json.boardId + ', sb' + json.startId);
        } else logger.warn('set_active_board: not presenter');
    });

    /**
     * Inform the grid views of a cleared board.
     * 
     * Only allowed for presenter (teacher).
     */
     socket.on('clear_board', function (json) {
        const sid = parseInt(json.sid);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            io.to(sid.toString()).emit('clear_board', { boardid: json.boardId });
        } else logger.warn('clear_board: not presenter');
    });

    /**
     * Inform the viewers of a changed board background color or grid settings.
     * 
     * Only allowed for presenter (teacher).
     */
    socket.on('change_board_settings', function (json) {
        const sid = parseInt(json.sid);
        if(socket == sd[sid].presentersocket && isPresenter(sid, json.token)){
            logger.verbose('setting default board color to ' + json.bgcolor);
            //sd[sid].currentBoardColor = json.bgcolor ?? DEF_BOARD.color;
            sd[sid].currentBoardSettings = json.settings.settings ?? DEF_BOARD;
            io.to(sid.toString()).emit('change_board_settings', json);
        } else logger.warn('change_board_settings: not presenter');
    });
});

/**
 * Presentation-related endpoints
 */

app.use(
    OpenApiValidator.middleware({
        apiSpec: './src/blackboard_openapi.json',
        validateRequests: {removeAdditional: false}, // (default, unknown params disallowed)
        validateResponses: false, // (default, mainly useful in development)
        validateApiSpec: true,
        //ignorePaths: (path) => {path.startsWith('/board/') || path.startsWith('/lastline/')}
    }),
);

app.post('/login/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(isNaN(sid)) {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing or invalid`);
        return next(error);
    }
    if(sid === 0) {
        // No session yet, create a new one using the supplied presenter passwd
        if(req.body.presenterpw === '') {
            const error = createHttpError.BadRequest(`sid ${sid}: Presenter password cannot be empty`);
            return next(error);
        }
        if(req.body.sessionname === '') {
            const error = createHttpError.BadRequest(`sid ${sid}: Presentation title cannot be empty`);
            return next(error);
        }
        try {
            // Create hash from the supplied presenter password, then try to add new session to database
            await bcrypt.hash(req.body.presenterpw, 10, async function(err, hash) {
                if(err) return res.status(500).send('Error hashing password!');
                await pool.query(`
                    insert into cbsessions (viewerpw, presenterpw, sessionname, ispublic, lastlogin, settings) VALUES ($1,$2,$3,$4,now(),$5) returning id;
                    `, [req.body.viewerpw, hash, req.body.sessionname, req.body.ispublic, DEF_UI], (q2_err, q2_res) => {
                        if (q2_err) {
                            const error = createHttpError.InternalServerError(q2_err.stack);
                            return next(error);
                        }
                        sd[q2_res.rows[0].id] = {id: q2_res.rows[0].id, viewerpw: req.body.viewerpw, presenterhash: hash, settings: DEF_UI}
                        logger.verbose({id: q2_res.rows[0].id, viewerpw: req.body.viewerpw, presenterhash: hash});
                        setMod(q2_res.rows[0].id, DEF_UI.boards.sb, Date.now());
                        // Sign a new JWT token using the password hash
                        const accessToken = signToken(hash, "presenter");
                        logger.verbose(sd);
                        return res.status(200).json({ sessionInfo: {id: q2_res.rows[0].id, sessionname: req.body.sessionname, viewerpw: req.body.viewerpw, ispublic: req.body.ispublic }, token: accessToken, settings: DEF_UI});
                    }
                )
            })
        } catch (err) {
            const error = createHttpError.InternalServerError(err);
            return next(error);
        }
     } else {
        // We have a session id to join, so first check there is no presenter already, then try to load the session data
        if(sd[sid]) {
            if(sd[sid].presentersocket) {
                if(sd[sid].presentersocket.connected) {
                    logger.verbose(sd[sid].presentersocket);
                    return res.status(401).json({error: 'Presenter is already logged in for this presentation'});
                }
            }
        }
        // Note: updateSessionCache fills the local cache at sd[sid] with info from DB
        const sessionfound = await updateSessionCache(sid);
        //logger.verbose('sdata: ', sdata);
        if(!sessionfound) return res.status(500).send('Could not get presentation info');
        const result = await bcrypt.compare(req.body.presenterpw, sd[sid].presenterhash);
        if(!result) {
            // Passwords do not match
            const error = createHttpError.Unauthorized(`sid ${sid}: Invalid presenter password`);
            return next(error);
        } else {
            // Password ok
            const accessToken = signToken(sd[sid].presenterhash, "presenter");

            // Do not pass the presenter password back to client
            return res.status(200).json({
                sessionInfo: {
                    viewerpw: sd[sid].viewerpw, 
                    id: sid, 
                    sessionname: sd[sid].sessionname, 
                    ispublic: sd[sid].ispublic
                },
                settings: sd[sid].settings,
                token: accessToken
            });
        }
    }
})

app.get('/sessions', async (req, res, next) => {
     try {
        const { rows } = await pool.query(`
        select id, sessionname, lastlogin, lastview, (CASE WHEN viewerpw != '' THEN true ELSE false END) AS has_pw 
        from cbsessions where ispublic is true order by lastlogin desc;
        `);
        return res.status(200).json(rows);
     } catch (err) {
        const error = createHttpError.InternalServerError(err);
        return next(error);
    }
})


/**
 * From this line on, all endpoints require authorization by a JWT token
 */
app.use(function(req, res, next) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        // No Vary required: cors sets it already set automatically
        res.end();
    } else {
        if (!req.headers.authorization) {
            const error = createHttpError.Forbidden(`sid ${sid}: No credentials sent`);
            return next(error);
        }
        next();
    }
});

/**
 * Patch settings (json) only
 */
app.patch('/settings/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest(`sid ${sid}: Request body missing`);
        return next(error);
    }
    if(sid > 0) {
        if(isPresenter(sid, parseToken(req.headers.authorization))) {
            if(req.body.settings) {
                logger.verbose(req.body.settings);
                // TODO: Add some sanity checks on required fields here...
            } else {
                const error = createHttpError.BadRequest(`sid ${sid}: Presentation data missing`);
                return next(error);
            }
            try {
                await pool.query(`
                    update cbsessions set settings = $1 where id = $2;
                    `, [req.body.settings, sid]);
                return res.status(200).json({message: 'Settings updated'}); // no need to send the same settings back
            } catch (err) {
                const error = createHttpError.InternalServerError(err);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

/**
 * Patch main session info (passwords and other separate fields)
 */
app.patch('/session/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest('Request body missing', {sid: sid});
        return next(error);
    }
    if(sid > 0) {
        if(isPresenter(sid, parseToken(req.headers.authorization))) {
            let newPresenterToken;
            logger.verbose(req.body);
            // Take new passwords from body, or use previous if not given
            const vpw = req.body.hasOwnProperty("viewerpw") ? req.body.viewerpw : (sd[sid].viewerpw ? sd[sid].viewerpw : '');
            const sname = req.body.hasOwnProperty("sessionname") ? req.body.sessionname : sd[sid].sessionname;
            if(sname === '') {
                const error = createHttpError.BadRequest(`sid ${sid}: Session name cannot be blank`);
                return next(error);
            }
            const pub = req.body.hasOwnProperty("ispublic") ? req.body.ispublic : (sd[sid].ispublic ? true : false);

            logger.verbose('was vpw: ' + sd[sid].viewerpw + ', ppw:' + sd[sid].presenterpw + ', sname:' + sd[sid].sessionname + ', pub:' + sd[sid].ispublic);
            //logger.verbose('vpw: ' + vpw + ', sname:' + sname + ', pub:' + pub);

            // If we are changing the presenter password, handle it as a special case
            // and make sure it's not blank. We are sending it as blank anyway so it cannot get
            // stored in the browser at any point.
            if(req.body.hasOwnProperty("presenterpw") && req.body.presenterpw !== '') {
                try {
                    await bcrypt.hash(req.body.presenterpw, 10, async function(err, hash) {
                        if(err) {
                            const error = createHttpError.InternalServerError(err);
                            return next(error);
                        }
                        await pool.query(`
                            update cbsessions set viewerpw = $1, presenterpw = $2, sessionname = $3, ispublic = $4 where id = $5;
                            `, [vpw, hash, sname, pub, sid]);
                        sd[sid].presenterhash = hash;
                        sd[sid].viewerpw = vpw;
                        sd[sid].sessionname = sname;
                        logger.verbose('PATCH /session/:sessionid : ', {id: sid, viewerpw: vpw, presenterhash: hash});
                        setMod(sid, DEF_UI.boards.sb, Date.now());
                        newPresenterToken = signToken(hash, "presenter");
                        return res.status(200).json({presenterpw: '', viewerpw: vpw, sessionname: sname, ispublic: pub, token: newPresenterToken});
                    })
                } catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error);
                }
            } else {
                // Not updating presenter password
                try {
                    await pool.query(`
                        update cbsessions set viewerpw = $1, sessionname = $2, ispublic = $3 where id = $4;
                        `, [vpw, sname, pub, sid]);
                    if(sd[sid].viewerpw !== vpw) io.to(sid.toString()).emit('password_changed');
                    sd[sid].viewerpw = vpw;
                    sd[sid].sessionname = sname;
                    return res.status(200).json({presenterpw: '', viewerpw: vpw, sessionname: sname, ispublic: pub});
                }
                catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error);
                }
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.delete('/session/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            try {
                // leave the first board
                await pool.query(`delete from shapes where sessionid = $1;`, [sid]);
                await pool.query(`delete from boards where sessionid = $1;`, [sid]);
                await pool.query(`delete from cbsessions where id = $1;`, [sid]);
                setMod(sid, null, null);
                io.to(sid.toString()).emit('session_deleted');
                return res.status(200).json({status: 'success'});
            }
            catch (err) {
                const error = createHttpError.InternalServerError(err);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})


/**
 * Endpoints related to shapes
 */

 app.get('/shapesinfo/:mode/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    const mode = req.params.mode === 'fill' ? 'fill' : 'stroke';
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        let colors;
        if(presenter) {
            try {
                const { rows } = await pool.query(`
                select distinct(` + mode + `) from shapes where ` + mode + ` != 'wipe' and sessionid = $1;
                `, [sid]);
                // Map result array from [{stroke: '#f5f5f5'},...] to ['#f5f5f5', ...]
                colors = (mode === 'fill' ? rows.map(x => x.fill) : rows.map(x => x.stroke));
            } catch (error) {
                logger.error('GET /shapesinfo/:mode/:sessionid : Error getting ' + mode + ' colors');
                throw new Error('Error getting ' + mode + ' colors')
            }

            return res.status(200).json({colors: colors})
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.put('/shape/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest('Request body missing', {sid: sid});
        return next(error);
    }
    if(sid > 0) {
        var presenter = false;
        try {
            presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        } catch(err) {
            const error = createHttpError.Forbidden(`sid ${sid}: No access (${err.message})`);
            return next(error);
        }
        if(presenter) {
            // All shapes need to have boardid and at least some shapedetails
            if(req.body.boardid !== undefined && req.body.shapedetails !== undefined) {
                //logger.verbose(util.inspect(req));
                switch(req.body.shapetype) {
                    case 'Line':
                    case 'Polyline':
                        // Line, Polyline and Arrow need shapedata to be present
                        if(!req.body.shapedata) {
                            const error = createHttpError.BadRequest(`sid ${sid}: Coordinate points missing`);
                            return next(error);
                        }
                        break;
                    case 'Arrow':
                        // Line, Polyline and Arrow need shapedata to be present
                        if(!req.body.shapedata) {
                            const error = createHttpError.BadRequest(`sid ${sid}: Coordinate points missing`);
                            return next(error);
                        }
                        const datalen = req.body.shapedata.length;
                        // Arrow has an old format [0,0,x,y] and a new one [[0,0,0],[timediff,x,y]]
                        if(datalen !== 2 && datalen !== 4) {
                            const error = createHttpError.BadRequest(`sid ${sid}: Invalid points for arrow`);
                            return next(error);
                        }
                        break;
                    case 'Rect':
                        if(!req.body.shapedetails.width || !req.body.shapedetails.height) {
                            const error = createHttpError.BadRequest(`sid ${sid}: Rectangle has no width or height`);
                            return next(error);
                        }
                        break;
                    case 'Circle':
                    case 'Dot':
                        if(!req.body.shapedetails.radius) {
                            const error = createHttpError.BadRequest(`sid ${sid}: Circle has no radius`);
                            return next(error);
                        }
                        break;
                    case 'Ellipse':
                        if(!req.body.shapedetails.radiusX && !req.body.shapedetails.radiusY) {
                            const error = createHttpError.BadRequest(`sid ${sid}: Ellipse has invalid radius`);
                            return next(error);
                        }
                        break;
                    case 'Grid':
                        if(!req.body.shapedetails.width && !req.body.shapedetails.height) {
                            const error = createHttpError.BadRequest(`sid ${sid}: Coordinate system is missing width or height`);
                            return next(error);
                        }
                        break;
                    default:
                        const error = createHttpError.BadRequest(`sid ${sid}: Unknown shape type`);
                        return next(error);
                        break;
                    }
                //const points = [];
                //for (let i = 0; i < req.body.points.length; i += 2) {
                //    points.push({ x: req.body.points[i], y: req.body.points[i + 1], time: req.body.timestamps[i / 2] });
                //}
    
                logger.verbose("Starting query with: " + req.body.starttime, req.body.shapetype, req.body.boardid, req.body.shapedetails);
    
                try {
                    const { rows } = await pool.query(`
                        INSERT INTO shapes(sessionid, visible, starttime, shapetype, stroke, fill, x, y, boardid, shapedetails, shapedata) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id;
                        `, [sid, req.body.visible, req.body.starttime, req.body.shapetype, req.body.stroke, req.body.fill, req.body.x, req.body.y, req.body.boardid, req.body.shapedetails, JSON.stringify(req.body.shapedata)])
                    setMod(sid, req.body.boardid, Date.now());
                    // send line to all clients
                    io.to(sid.toString()).emit('draw_shape', { shapetype: req.body.shapetype, shapeid: rows[0].id, stroke: req.body.stroke, fill: req.body.fill, starttime: req.body.starttime, x: req.body.x, y: req.body.y, boardid: req.body.boardid, shapedetails: req.body.shapedetails, shapedata: req.body.shapedata });
                    return res.status(200).json(rows[0])
                } catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error);
                }
            } else {
                const error = createHttpError.BadRequest(`sid ${sid}: Shape or board id invalid, or critical data missing`);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.get('/shape/:sessionid/:id', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            if(req.params.id !== undefined) {
                try {
                    const { rows } = pool.query(`
                        select * from shapes WHERE sessionid = $1 AND visible = 't' AND id = $2;
                        `, [req.params.id]);
                        res.status(200).json(rows)
                } catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error);
                }
            } else {
                const error = createHttpError.BadRequest(`sid ${sid}: Board id missing`);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.patch('/shape/:sessionid/:id', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    var bid; // board id to be sent back and used for timestamping changes
    var jres, jres1; // results from the queries
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest(`sid ${sid}: Request body missing`);
        return next(error);
    }
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            const id = parseInt(req.params.id);
            if(id > 0) {
                var query = ['UPDATE shapes SET'];
                var querykeys = [];
                var queryvals = [];
                var placeholders = [];
                const allowed = ['visible','starttime','erasetime','shapetype','x','y','stroke','fill'];
                //logger.verbose(util.inspect(req));
                var i = 1;

                Object.keys(req.body).forEach(function(key, index, val) {
                    if(allowed.includes(key)) {
                        querykeys.push(key);
                        placeholders.push(key + ' = ($' + (i) + ')');
                        queryvals.push(req.body[key]);
                        i++;
                    }
                })
                // If we have non-json top-level property parameters (i.e. anything but the shapedetails/shapedata)
                // We do an update query first for these
                if(querykeys.length) {
                    query.push(placeholders.join(', '));
                    query.push('WHERE sessionid = ' + sid + ' AND id = ' + id + ' RETURNING id, boardid, ' + querykeys.join(', '));
                    query = query.join(' ');
                    try {
                        const toplevel = await pool.query(query, queryvals);
                        bid = parseInt(toplevel.rows[0].boardid);
                        jres = toplevel.rows[0];
                        if(bid > 0) {
                            // If the request has json fields (shapedetails/shapedata), we handle them as a special case in another query
                            var jsonQueryKeys = [];
                            if(req.body.shapedetails !== undefined) {
                                jsonQueryKeys.push("shapedetails = shapedetails || '" + JSON.stringify(req.body.shapedetails) + "'");
                            }
                            if(req.body.shapedata !== undefined) {
                                jsonQueryKeys.push("shapedata = '" + JSON.stringify(req.body.shapedata) + "'");
                            }
                            if(jsonQueryKeys.length) {
                                const jsonQuery = query = jsonQueryKeys.join(', ');
                                const { rows } = await pool.query("update shapes set " + jsonQuery + 
                                    " WHERE sessionid = " + sid + " AND id = " + id + 
                                    " RETURNING id, boardid" + (req.body.shapedetails ? ", shapedetails" : "") +
                                    (req.body.shapedata ? ", shapedata" : ""));
                                bid = parseInt(rows[0].boardid);               
                                if(bid > 0) {
                                    jres1 = rows[0];
                                    setMod(sid, bid, Date.now());
                                    // Merge results from two queries
                                    let result = {...jres, ...jres1};
                                    logger.verbose('jres: ', jres, 'jres1:',jres1, 'result:',result);
                                    io.to(sid.toString()).emit('shape_modified', result);
                                    return  res.status(200).json({message: "Shape modified"});
                                } else {
                                    const error = createHttpError.InternalServerError(`sid ${sid}: Board not found for shape`);
                                    return next(error);
                                }
                            } else {
                                setMod(sid, bid, Date.now());
                                //jres = toplevel.rows[0];
                                // Combine keys and values to form an object with all the values change
                                //var changeddata = querykeys.reduce((obj, key, index) => ({ ...obj, [key]: queryvals[index] }), {});
                                // Merge objects to return final result to emit (all changed parameters plus shapeid)
                                io.to(sid.toString()).emit('shape_modified', jres);
                                return res.status(200).json({message: "Shape modified"});
                            }
                        } else {
                            const error = createHttpError.InternalServerError(`sid ${sid}: Board not found for shape`);
                            return next(error);
                        }
                    } catch (err) {
                        const error = createHttpError.InternalServerError(err);
                        return next(error);
                    }
                } else {
                    // We are only asked to update shapedetails and/or shapedata
                    // NOTE: Inputs are checked by express-openapi-validator, and none of the fields here are (at this time)
                    // free-form strings, so it's probably safe to save them to db. Still something to look out for later on.
                    // NOTE: json "fields" are written in lowerCamelCase, actual SQL fields in lowercase
                    try {
                        var jsonQueryKeys = [];
                        if(req.body.shapedetails !== undefined) {
                            jsonQueryKeys.push("shapedetails = shapedetails || '" + JSON.stringify(req.body.shapedetails) + "'");
                        }
                        if(req.body.shapedata !== undefined) {
                            jsonQueryKeys.push("shapedata = '" + JSON.stringify(req.body.shapedata) + "'");
                        }
                        if(jsonQueryKeys.length) {
                            const jsonQuery = query = jsonQueryKeys.join(' ');
                            const { rows } = await pool.query("update shapes set " + jsonQuery + 
                                " WHERE sessionid = " + sid + " AND id = " + id + 
                                " RETURNING id, boardid" + (req.body.shapedetails ? ", shapedetails" : "") +
                                (req.body.shapedata ? ", shapedata" : ""));
                            bid = parseInt(rows[0].boardid);
                            if(bid > 0) {
                                setMod(sid, bid, Date.now());
                                jres1 = rows[0];
                                io.to(sid.toString()).emit('shape_modified', rows[0]);
                                return res.status(200).json({message: "Shape modified"});
                            } else {
                                const error = createHttpError.InternalServerError(`sid ${sid}: Board not found for shape`);
                                return next(error);
                            }
                        } else {
                            const error = createHttpError.BadRequest(`sid ${sid}: No valid fields found to update`);
                            return next(error);
                        }
                    } catch (err) {
                        const error = createHttpError.InternalServerError(err);
                        return next(error);
                    }
                }
            } else {
                const error = createHttpError.BadRequest(`sid ${sid}: Shape id missing`);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.delete('/shapes/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest(`sid ${sid}: Request body missing`);
        return next(error);
    }
    if(!req.body.dbIds || !req.body.dbIds.length) {
        const error = createHttpError.BadRequest(`sid ${sid}: Shape ids missing`);
        return next(error);
    }
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            const erasetime = Date.now();
            try {
                await pool.query(`
                    UPDATE shapes SET visible = 'f', erasetime = $1 where sessionid = $2 and id = ANY($3);
                    `, [erasetime, sid, req.body.dbIds]);
                setMod(sid, req.params.board, Date.now());
                const json = {shapeids: req.body.dbIds}
                io.to(sid.toString()).emit('shapes_deleted', json);
                res.status(200).json(json)
            } catch (err) {
                const error = createHttpError.InternalServerError(err);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.put('/cloneshape/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest(`sid ${sid}: Request body missing`);
        return next(error);
    }
    // shapeId is passed as string, but it needs to qualify as BigInt
    let shapeid;
    try {
        shapeid = BigInt(req.body.shapeId);
    } catch (error) {
        const err = createHttpError.BadRequest(`shapeId ${req.body.shapeId}: Invalid shapeId`);
        return next(err);
    }
    if( typeof shapeid !== "bigint" || isNaN(req.body.x) || isNaN(req.body.y)) {
        const error = createHttpError.BadRequest(`sid ${sid}: Shapeid or coordinates missing or invalid`);
        return next(error);
    }
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            try {
                const { rows } = await pool.query(`
                    INSERT INTO shapes(sessionid, boardid, visible, starttime, shapetype, stroke, fill, x, y, shapedetails, shapedata) 
                    SELECT sessionid, boardid, visible, starttime + 1, shapetype, stroke, fill, ` + Number(req.body.x) + `,` + Number(req.body.y) + `, shapedetails, shapedata 
                    FROM shapes WHERE sessionid = $1 and id = $2
                    RETURNING id, sessionid, boardid, visible, starttime, shapetype, stroke, fill, x, y, shapedetails, shapedata;
                    `, [sid, shapeid]);

                setMod(sid, rows[0].boardid, Date.now());
                io.to(sid.toString()).emit('draw_shape', { 
                    shapetype: rows[0].shapetype, 
                    shapeid: rows[0].shapeid, 
                    stroke: rows[0].stroke, 
                    fill: rows[0].fill, 
                    starttime: rows[0].startTime, 
                    x: rows[0].x, 
                    y: rows[0].y, 
                    boardid: rows[0].boardid, 
                    shapedetails: rows[0].shapedetails, 
                    shapedata: rows[0].shapedata
                });
                return res.status(200).json(rows[0])
            } catch (err) {
                const error = createHttpError.InternalServerError(err);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.patch('/shaperecolor/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest(`sid ${sid}: Request body missing`);
        return next(error);
    }
    if(!req.body.color || req.body.color.length > 7) {
        const error = createHttpError.BadRequest(`sid ${sid}: Board color missing or invalid`);
        return next(error);
    }
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            if(req.body.color !== '' && req.body.dbIds.length > 0) {
                try {
                    const { rows } = await pool.query(`
                        UPDATE shapes SET stroke = $1 where sessionid = $2 and id = ANY($3);
                        `, [req.body.color, sid, req.body.dbIds]);
                    setMod(sid, req.body.boardid, Date.now());
                    const json = {color: req.body.color, shapeids: req.body.dbIds}
                    io.to(sid.toString()).emit('shapes_recolored', json);
                    return res.status(200).json(json)
                } catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error);
                }
            } else {
                const error = createHttpError.BadRequest(`sid ${sid}: Invalid line parameters`);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.patch('/lastline/:sessionid/:boardId', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            const boardId = parseInt(req.params.boardId);
            if(boardId > 0) {
                try {
                    const { rows } = await pool.query(`
                        select id, boardid from shapes where sessionid = $1 and boardId = $2 and visible = 'f' order by erasetime desc, starttime desc limit 1;
                        `, [sid, boardId]);
                    if (!rows.length) {
                        return res.status(404).send('No shapes to restore');
                    } else {
                        //logger.verbose(util.inspect(q_res));
                        //logger.verbose('got id: ' + q_res.rows[0].id + ' and board ' + q_res.rows[0].boardid);
                        // Update query returns the updated shape
                        const updated = await pool.query(`
                            UPDATE shapes SET visible = 't', erasetime = null
                            where sessionid = $1 and id = $2 RETURNING *;
                            `, [sid, rows[0].id]);
                        //fetchBoardData(q_res.rows[0].boardid, null);
                        setMod(sid, boardId, Date.now());
                        io.to(sid.toString()).emit('draw_shape', updated.rows[0]);
                        res.status(200).json(updated.rows[0])
                    }
                } catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error);
                }
            } else {
                //logger.verbose(util.inspect(res));
                const error = createHttpError.BadRequest(`sid ${sid}: Board id missing`);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.delete('/lastline/:sessionid/:boardId', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            const erasetime = Date.now();
            const boardId = parseInt(req.params.boardId);
            if(boardId > 0) {
                try {
                    const { rows } = await pool.query(`
                        select id, sessionid, boardid from shapes where sessionid = $1 and boardId = $2 and visible = 't' order by starttime desc limit 1;
                        `, [sid, boardId]);
                    if (!rows.length) {
                        return res.status(404).send('No shapes left to delete on this board');
                    } else {
                        logger.verbose('got id: ' + rows[0].id + ' and board ' + rows[0].boardid);
                        await pool.query(`
                            UPDATE shapes SET visible = 'f', erasetime = $1 where sessionid = $2 and id = $3;
                            `, [erasetime, sid, rows[0].id]);
                        //fetchBoardData(rows[0].boardid, null);
                        setMod(sid, rows[0].id, erasetime);
                        const json = {boardid: parseInt(rows[0].boardid), shapeids: [rows[0].id]};
                        io.to(sid.toString()).emit('shapes_deleted', json);
                        return res.status(200).json(json)
                    }
                } catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error);
                }
            } else {
                const error = createHttpError.BadRequest(`sid ${sid}: Board id missing`);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})


/**
 * Endpoints related to boards
 */

app.get('/boardsettings/all/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        logger.verbose('presenter: ', presenter);
        if(presenter) {
            let settings;
            try {
                const { rows } = await pool.query(`
                select id as boardid, bgcolor as color, settings from boards WHERE sessionid = $1 order by id;
            `, [sid]);
                settings = rows;
            } catch (err) {
                const error = createHttpError.InternalServerError(err);
                return next(error);
            }
            return res.status(200).json({boards: sd[sid].settings.boards, settings: settings});
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.get('/board/:sessionid/:id', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    const bid = parseInt(req.params.id);
    if(sid > 0) {
        if(bid > 0) {
            const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
            if(presenter) {
                if(!sd[sid].currentBoardSettings || !sd[sid].currentBoardSettings?.settings) sd[sid]['currentBoardSettings'] = DEF_BOARD;
                //var bgcolor = sd[sid].currentBoardColor || DEF_BOARD.color;
                var settings = sd[sid].currentBoardSettings;
                if(settings.color === 'undefined') settings['color'] = DEF_BOARD.color;
                // Do not carry background image to next board, at least by default
                if(typeof(settings.settings.bg) !== 'undefined') {
                    settings.settings.bg = DEF_BOARD.settings.bg;
                } else settings.settings['bg'] = DEF_BOARD.settings.bg;
                try {
                    const { rows } = await pool.query(`
                        select bgcolor, settings from boards WHERE sessionid = $1 AND id = $2;
                        `, [sid, bid]);
                    logger.verbose('length: ' + rows.length);
                    if (rows.length !== 1) {
                        // The board does not exist yet; add a new one with settings copied from previously fetched board
                        // NOTE: on conflict added in case there are several requests from client and board gets inserted between queries
                        logger.verbose('adding board of color ' + settings.color);
                        await pool.query(`insert into boards (sessionid,id,bgcolor,settings) values ($1,$2,$3,$4) on conflict (id,sessionid) do nothing;`
                            , [sid, bid, settings.color, settings.settings]);
                        setMod(sid, bid, Date.now());
                        // fetchBoardData sends board data via websocket as a side effect
                        fetchBoardData(sid, bid);
                        return res.status(200).json({settings: settings, shapes: []})
                    } else { // id, shapecolor, shapeid, starttime, x, y, shapetype, shapedetails, shapedata
                        // Set the now fetched board's settings as default for new boards
                        sd[sid].currentBoardSettings = {color: rows[0].bgcolor, settings: rows[0].settings};
                        const shapes = await pool.query(`
                            select id, boardid, stroke, fill, starttime, x, y, shapetype, shapedetails, shapedata from shapes WHERE sessionid = $1 AND boardid = $2 AND visible = 't' order by starttime asc;
                            `, [sid, bid]);
                        return res.status(200).json({settings: sd[sid].currentBoardSettings, shapes: shapes.rows})
                    }
                } catch (error) {
                    return next(error);
                }
            } else {
                const error = createHttpError.Forbidden(`sid ${sid}: No access`);
                return next(error);
            }
        } else {
            const error = createHttpError.NotFound(`sid ${sid}: Board id missing`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.patch('/board/:sessionid/:id', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(!req.body || Object.keys(req.body).length === 0) {
        const error = createHttpError.BadRequest(`sid ${sid}: Request body missing`);
        return next(error);
    }
    if(!req.body.boardSettings) {
        const error = createHttpError.BadRequest(`sid ${sid}: Board settings missing`);
        return next(error);
    }
    if(!req.body.boardSettings.color || req.body.boardSettings.color.length > 7) {
        const error = createHttpError.BadRequest(`sid ${sid}: Board color missing or invalid`);
        return next(error);
    }
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            //logger.verbose(util.inspect(req));
            if(req.params.id !== undefined && req.body.boardSettings !== undefined && req.body.boardSettings.color !== undefined) {
                try {
                    logger.verbose('changing board ' + req.params.id + ' color to ' + req.body.boardSettings.color + ' and settings to',req.body.boardSettings.settings);
                    await pool.query(`
                        UPDATE boards SET bgcolor = $1, settings = $2 WHERE sessionid = $3 and id = $4;
                        `, [req.body.boardSettings.color, req.body.boardSettings.settings, sid, req.params.id]);

                    io.to(sid.toString()).emit('change_board_settings', { boardid: req.params.id, settings: req.body.boardSettings });
                    setMod(sid, req.params.id, Date.now());
                    //sd[sid].currentBoardColor = req.body.bgcolor || DEF_BOARD.color;
                    sd[sid].currentBoardSettings = req.body.boardSettings;
                    const { rows } = await pool.query(`select distinct(bgcolor) from boards WHERE sessionid = $1;`, [sid]);
                    return res.status(200).json({colors: rows})
                } catch (err) {
                    const error = createHttpError.InternalServerError(err);
                    return next(error)
                }
            } else {
                const error = createHttpError.BadRequest(`sid ${sid}: Unknown board id or color`);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.delete('/board/:sessionid/:id', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            try {
                const { rows } = await pool.query(`
                    DELETE FROM shapes WHERE sessionid = $1 and boardid = $2;
                    `, [sid, req.params.id]);
                setMod(sid, req.params.id, Date.now());
                io.to(sid.toString()).emit('clear_board', { boardid: req.params.id });
                return res.status(200).json(rows)
            } catch (error) {
                logger.error('DELETE /board/:sessionid/:id :', error);
                return next(error)
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

app.delete('/boards/all/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            try {
                // leave the first board
                await pool.query(`delete from shapes where sessionid = $1;`, [sid]);
                await pool.query(`delete from boards where sessionid = $1 and id > 1;`, [sid]);
                await pool.query(`update boards set bgcolor = '#284646', settings = $1 where sessionid = $2 and id = 1;`, [DEF_BOARD, sid]);
                const now =  Date.now()
                setMod(sid, DEF_UI.boards.sb, now);
                io.to(sid.toString()).emit('clear_all');
                io.to(sid.toString()).emit('board_data', {mod: now, data: {boardid: 1, settings: DEF_BOARD, data: []}});
                sd[sid].currentBoardSettings = DEF_BOARD;
                return res.status(200).json({boardid: DEF_UI.boards.ab, settings: DEF_BOARD, shapes: []});
            }
            catch (err) {
                // TODO: should this be shown in production?
                const error = createHttpError.InternalServerError(err);
                return next(error);
            }
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})


/**
 * Endpoints related to Image-proxy
 */

async function imageProxy(req, res, next) {
    logger.verbose('url:',req.params.url);
    const sid = parseInt(req.params.sessionid);
    if(sid > 0) {
        if(isPresenter(sid, parseToken(req.headers.authorization))) {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET");
            //res.header("Access-Control-Allow-Headers", req.header('access-control-request-headers'));

            if (req.method === 'OPTIONS') {
                // CORS Preflight
                res.send();
            } else {
                var targetURL = decodeURI(req.header('Target-URL')); // Target-URL ie. https://example.com or http://example.com
                if (!targetURL) {
                    const error = createHttpError.BadRequest('There is no Target-URL header in the request');
                    return next(error);
                }
                logger.info('fetching',targetURL);
                const response = await fetch(targetURL, {headers: {'Accept': 'image/jpg, image/jpeg, image/png'}});
                const returnType = response.headers.get('content-type');
                if(returnType.startsWith('image/')) {
                    const blob = await response.arrayBuffer();
                    res.header('content-length', response.headers.get('content-length'));
                    //res.header('content-disposition', `inline;filename="${slug}"`);
                    res.header('content-type', response.headers.get('content-type'));
                    res.status(200).send(Buffer.from(blob));
                } else {
                    const error = createHttpError.NotFound(`sid ${sid}: No image found from the given URL`);
                    return next(error);
                }
            }
        }
    }
}

// Using the same function for both OPTIONS and GET requests
app.options('/image-proxy/:sessionid', imageProxy);
app.get('/image-proxy/:sessionid', imageProxy);

/** 
 * Get an image for pdf generation in base64 encoded form
 */
async function getImageBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.arrayBuffer();
        return `data:${response.headers.get("content-type")};base64,${Buffer.from(blob).toString("base64")}`;
    } catch (error) {
        logger.error('getImageBase64: ', error);
        return false;
    }
}

/**
 * Convert all boards into pdf format
 */

 app.get('/boards2pdf/:sessionid', async (req, res, next) => {
    const sid = parseInt(req.params.sessionid);
    const DEFAULT_STROKE_COLOR = '#f5f5f5'; // Default color for strokes; only used in pdf gen on backend side
    if(sid > 0) {
        const presenter = await isPresenter(sid, parseToken(req.headers.authorization));
        if(presenter) {
            // CSS: 96px = 1 in, PDF: 72px = 1 in
            //const xmult = 841.89 * 96 / 72; //a4
            //const ymult = 595.28 * 96 / 72; //a4
            const xmult = 1440 * 96 / 72;
            const ymult = 810 * 96 / 72;

            doc = new jsPDF({
                orientation: "landscape",
                unit: "px",
                hotfixes: ["px_scaling"], // needed for pixel units scaling
                format: [1920, 1080] //"a4"
            });

            const boardsquery = {
                name: 'fetch-boards',
                text: 'select id, bgcolor, settings from boards where sessionid = $1 order by id',
                values: [sid]
            }
            pool
                .query(boardsquery)
                .then( async (boards_res) => {
                    for (let board of boards_res.rows) {
                        logger.verbose(board);
                        if(board.id > 1) doc.addPage(); // Note: board 1 needs to be present to prevent empty first page
                        let bgcolor = board.bgcolor ?? DEF_BOARD.color;     // Color to use for the background rect if not defined (it should always be)
                        let drawcolor = DEFAULT_STROKE_COLOR;  // Default color for strokes if not defined

                        doc.setFillColor(bgcolor); // TODO: need to check the case where we have no shapes
                        doc.setDrawColor(drawcolor);
                        logger.verbose('adding background')
                        doc.rect(0,0,xmult,ymult,'F');
                        doc.text("" + board.id, 10, 20); // Add board number on top left corner, TODO: use tinycolor for proper coloring?

                        if(board.settings?.bg?.visible) {
                            if(board.settings?.bg?.url) {
                                try {
                                    const img = await getImageBase64(board.settings.bg.url);
                                    logger.verbose(img);
                                    logger.verbose('JPEG', 0, 0, xmult, ymult, img.length);
                                    if(img) doc.addImage(img, 'JPEG', 0, 0, xmult, ymult);
                                } catch {
                                    (error) => logger.info(error)
                                }
                            }
                        }
                        if(board.settings?.grid?.present) {
                            hSpacing = 1920 * board.settings?.grid?.cellWidth * 0.01;
                            vSpacing = 1080 * board.settings?.grid?.cellHeight * 0.01;
                            logger.verbose('hspacing: ', hSpacing, ', vspacing: ', vSpacing, ', aspect: ', board.settings?.grid?.aspect);
                            // Create a dummy shape with necessary info to be turned into a grid
                            const bg_grid_shape = {
                                x: 0,
                                y: 0,
                                stroke: board.settings?.grid?.stroke ?? DEFAULT_STROKE_COLOR,
                                shapedetails: {
                                    width: 99.9,  // percentage of total board width
                                    height: 99.9, // percentage of total board height
                                    hspacing: hSpacing / (xmult * 0.01),
                                    vspacing: vSpacing / (ymult * 0.01),
                                    strokeWidth: board.settings?.grid?.strokeWidth,
                                    opacity: board.settings?.grid?.opacity
                                }
                            }
                            const bgcontext = doc.context2d;
                            bgcontext.lineWidth = board.settings?.grid?.strokeWidth * 0.01 * xmult;

                            // We need to modify jsPDF GState in order to draw semi-transparent lines
                            if(board.settings?.grid?.opacity) {
                                logger.verbose('opacity: ', board.settings?.grid?.opacity);
                                doc.saveGraphicsState();
                                doc.setGState(new doc.GState({opacity: board.settings?.grid?.opacity, "stroke-opacity": board.settings?.grid?.opacity}));
                            }

                            pdf_makeKonvaGrid(bgcontext, bg_grid_shape, xmult * 0.01, ymult * 0.01);

                            // Restore opacity to previous setting
                            if(board.settings?.grid?.opacity) {
                                doc.restoreGraphicsState();
                            }
                        }
                        const shapesquery = {
                            name: 'fetch-shapes',
                            text: 'select boardid, shapetype, x, y, stroke, fill, shapedetails, shapedata from shapes where sessionid = $1 and boardid = $2 and visible = true order by boardid, starttime asc',
                            values: [sid, board.id]
                        }
                        logger.verbose('querying ', board.id);
                        let q_await = await pool
                            .query(shapesquery)
                            .then( shapes_res => {
                            logger.verbose(shapes_res.rows[0]);
                            for (let shape of shapes_res.rows) {
                                logger.verbose(shape);
                                doc.stroke(); // This is required or the paths have no stroke (not visible at all)!

                                // Lines have round joins and caps by default for smoother appearance
                                doc.setLineJoin('round');
                                doc.setLineCap('round');
                                if(shape.shapedetails !== null) { // skip empty boards with only background color defined
                                    // Common base coordinates for shape
                                    const x_base = parseFloat(shape.x).toFixed(5);
                                    const y_base = parseFloat(shape.y).toFixed(5);

                                    if(shape.stroke === 'wipe') {
                                        logger.verbose('shape ', shape.shapeid, ' is a wipe, setting color to bg: ', bgcolor);
                                        doc.setDrawColor(bgcolor);
                                        drawcolor = bgcolor;
                                    } else {
                                        if(drawcolor !== shape.stroke) {
                                            logger.verbose('setting drawcolor for shape ', shape.shapeid, ' to ', shape.shapecolor);
                                            doc.setDrawColor(shape.stroke);
                                            drawcolor = shape.stroke;
                                        }
                                    }
                                    doc.setLineWidth(shape.shapedetails.strokeWidth * 0.01 * xmult);
                                    doc.setFillColor(shape.stroke === 'wipe' ? bgcolor : shape.fill === 'wipe' ? bgcolor : shape.fill);
                                    const fillMode = shape.shapedetails.fillEnabled ? (shape.shapedetails.strokeEnabled ? 'DF' : 'F') : 'S'; 
                                    switch(shape.shapetype) {
                                        case 'Line':
                                        case 'Polyline':
                                            //doc.setLineWidth(shape.shapedetails.strokeWidth * 0.01 * xmult);
                                            const linelen = shape.shapedata.length;
                                            if(linelen > 0) {
                                                //Check if we have more than 40 points per second (multiplier 500 due to point pairs and milliseconds in timestamps)
                                                // If so, run the coordinates through simplifier. Otherwise just process them as such.
                                                const pps = 500 * linelen / (shape.shapedata[linelen - 1][0] - shape.shapedata[0][0]);
                                                logger.verbose(xmult, ' ', ymult, ' b ', x_base, ' ', y_base);
                                                let coords;
                                                if(pps > 40 && linelen > 4) {
                                                    const simplifyMultiplier = shape.shapedetails.strokeWidth; // TODO: find some sensible values for this
                                                    logger.verbose(shape.shapedata);
                                                    const excesscoords = shape.shapedata.map(item => [(parseFloat(x_base) + parseFloat(item[1]))*xmult, (parseFloat(y_base) + parseFloat(item[2]))*ymult])
                                                    logger.verbose(excesscoords);
                                                    const simplecoords = simplify(excesscoords,simplifyMultiplier,false);
                                                    logger.verbose(simplecoords);
                                                    coords = simplecoords.flatMap(item => [Number(item[0].toFixed(3)), Number(item[1].toFixed(3))]);
                                                    logger.verbose(coords);
                                                    logger.verbose('pps is high at ', pps, ', simplified with multiplier ',simplifyMultiplier, ': ', excesscoords.length, ' to ', simplecoords.length);
                                                } else {
                                                    coords = shape.shapedata.flatMap(item => [Number(((parseFloat(x_base) + parseFloat(item[1]))*xmult).toFixed(3)), Number(((parseFloat(y_base) + parseFloat(item[2]))*ymult).toFixed(3))]);
                                                    logger.verbose(coords);
                                                    logger.verbose('pps is ok at ', pps);
                                                }
                                                logger.verbose(coords);
                                                const context = doc.context2d;
                                                context.lineWidth = shape.shapedetails.strokeWidth * 0.01 * xmult;
                                                if(shape.shapedetails.fillEnabled) context.fillStyle = shape.stroke === 'wipe' ? bgcolor : shape.fill;
                                                // We can support arrowheaded regular lines also, just use pointerAtEnding, pointerLength and pointerWidth here
                                                pdf_drawLine(context, {
                                                    tension: shape.shapedetails.tension, 
                                                    bezier: shape.shapedetails.bezier, 
                                                    closed: shape.shapedetails.closed, 
                                                    x: x_base*xmult, y: y_base*ymult, 
                                                    strokeEnabled: shape.shapedetails.strokeEnabled,
                                                    stroke: drawcolor
                                                }, coords);
                                            }
                                            break;
                                        case 'Arrow':
                                            // Arrows have sharp endings by default (this is the Konva default)
                                            // EDIT: smooth ones look better after all so let's go with that
                                            //doc.setLineJoin('miter');
                                            //doc.setLineCap('butt');
                                            const acontext = doc.context2d;
                                            acontext.lineWidth = shape.shapedetails.strokeWidth * 0.01 * xmult;
                                            if(shape.shapedetails.fillEnabled) acontext.fillStyle = shape.stroke === 'wipe' ? bgcolor : shape.fill;
                                            var acoords = [0,0,0,0]; // In case of invalid Arrow definition, just create a dummy arrow
                                            // Old arrow format, without timestamps
                                            if(shape.shapedata.length === 4) {
                                                acoords = [0,0, 
                                                    Number(((parseFloat(x_base) + parseFloat(shape.shapedata[2] * 0.01))*xmult).toFixed(3)),
                                                    Number(((parseFloat(y_base) + parseFloat(shape.shapedata[3] * 0.01))*ymult).toFixed(3))
                                                ]
                                            } else if(shape.shapedata.length === 2) {
                                                 acoords = [0,0, 
                                                    Number(((parseFloat(x_base) + parseFloat(shape.shapedata[1][1] * 0.01))*xmult).toFixed(3)),
                                                    Number(((parseFloat(y_base) + parseFloat(shape.shapedata[1][2] * 0.01))*ymult).toFixed(3))
                                                ]
                                            }
                                            pdf_drawLine(
                                                acontext, 
                                                {
                                                    tension: 0, 
                                                    bezier: false, 
                                                    closed: false, 
                                                    x: x_base*xmult, 
                                                    y: y_base*ymult, 
                                                    strokeEnabled: true, 
                                                    stroke: drawcolor,
                                                    pointerAtEnding: true, 
                                                    pointerLength: (acontext.lineWidth + 2) * 2, 
                                                    pointerWidth: (acontext.lineWidth + 2) * 2 
                                                },
                                                acoords);
                                            /*doc.line(
                                                x_base*xmult, 
                                                y_base*ymult, 
                                                Number(((parseFloat(x_base) + parseFloat(shape.shapedata[2] * 0.01))*xmult).toFixed(3)), 
                                                Number(((parseFloat(y_base) + parseFloat(shape.shapedata[3] * 0.01))*ymult).toFixed(3)), 
                                                'S'
                                            );*/
                                            break;
                                        case 'Grid':
                                            const gcontext = doc.context2d;
                                            gcontext.lineWidth = shape.shapedetails.strokeWidth * 0.01 * xmult;
                                            logger.verbose(shape);
                                            pdf_makeKonvaGrid(gcontext, shape, xmult * 0.01, ymult * 0.01);
                                            break;
                                        case 'Ellipse':
                                            const radiusX = shape.shapedetails.radiusX * 0.01 * xmult;
                                            const radiusY = shape.shapedetails.radiusY * 0.01 * ymult;
                                            doc.ellipse((x_base*xmult), y_base*ymult, radiusX, radiusY, fillMode);
                                            break;
                                        case 'Rect':
                                            const width = shape.shapedetails.width * 0.01 * xmult;
                                            const height = shape.shapedetails.height * 0.01 * ymult;
                                            doc.rect((x_base*xmult), y_base*ymult, width, height, fillMode);
                                            logger.verbose('rect:',(x_base*xmult), y_base*ymult, width, height, fillMode);
                                            break;
                                        case 'Dot':
                                            radius = shape.shapedetails.radius * 0.01 * xmult;
                                            doc.ellipse((x_base*xmult), y_base*ymult, radius, radius, 'F');
                                            break;
                                        default:
                                            break;
                                        }
                                    }
                                // TODO: For some reason, the last line or each board is not visible
                                // This dummy line lets the line show, but find out why this happens!
                                //doc.lines([[0,0],[0,0]], 148.5, 105, [1,1], 'S', false);
                            }
                        })
                    }
                })
                .then(foo => {
                    // Do not save generated pdf into the filesystem to avoid information leakage
                    logger.info('sending pdf');
                    res.set("Content-Type", "application/pdf");
                    let buffer = new Buffer.from(doc.output('arraybuffer'));
                    res.status(201).send(buffer);
                })
                .catch(err => {
                    const error = createHttpError.InternalServerError(`sid ${sid}: Could not fetch boards from database`);
                    return next(error);
                })
        } else {
            const error = createHttpError.Forbidden(`sid ${sid}: No access`);
            return next(error);
        }
    } else {
        const error = createHttpError.BadRequest(`sid ${sid}: Presentation id missing`);
        return next(error);
    }
})

// catch 404 and forward to error handler
/*app.use(function (req, res, next) {
    next({ status: 404 });
});

app.use(function (err, req, res, next) {
    logger.error(err);
    res.status(err.status ?? 500).json();
});*/

app.all('/{*any}', function (req, res) {
    const error = createHttpError(404, 'Not found');
    logger.info('creating a 404');
    next(error);
})

app.use(errorHandlerMiddleware);

// Listen to connections from any client (0.0.0.0)
server.listen(NODE_SERVER_PORT, '0.0.0.0', function () {
    logger.warn(`Node.js running on port ${NODE_SERVER_PORT}`);
})