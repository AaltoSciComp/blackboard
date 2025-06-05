import React, { useState, useEffect, useRef } from "react";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import InputGroup from "react-bootstrap/InputGroup";
import FormControl from "react-bootstrap/FormControl";
//import Modal from "react-bootstrap/Modal";
import * as Icon from 'react-bootstrap-icons';
import { formatDistance } from 'date-fns'
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import useSortableData from '../hooks/useSortableData';
import download from 'downloadjs';
import { log } from "../logging.js";
import { DEBUG_LEVELS } from "../constants.js";

const Sessions = (props) => {
    const sess = props.sessions.length ? props.sessions : [];
    return(
      sess.map(session =>
        <Session key={session.id} session={session} view={props.view} present={props.present} />
      )
    )
}

const Session = (props) => {
    var lastviewtime, lastedittime;
    const now = new Date();
    if(props.session?.lastview){
        //lastviewtime = (new Date(props.session.lastview.replace(' ', 'T'))).toLocaleDateString();
        const lwt = (new Date(props.session.lastview.replace(' ', 'T')));
        lastviewtime = formatDistance(lwt, now);
    } else lastviewtime = 'Never';
    if(props.session.lastlogin) {
        //lastedittime = (new Date(props.session.lastlogin.replace(' ', 'T'))).toLocaleDateString();
        const ldt = (new Date(props.session.lastlogin.replace(' ', 'T')));
        lastedittime = formatDistance(ldt, now);
  } else lastedittime = 'Never';
    return(
        <tr className="table-dark" key={props.session.id}>
            <td style={{whiteSpace: "nowrap"}}>
            <ViewButton pw={props.session.has_pw} view={props.view} session={props.session}/>
            <Button size="sm" onClick={() => props.present(props.session.id)}><Icon.Pencil /></Button>
            {/*<PdfButton pw={props.session.has_pw} view={props.view} session={props.session}/>*/}
            </td>
            <td>{props.session.id}</td>
            <td>{props.session.sessionname}</td>
            <td>{lastedittime}</td>
            <td>{lastviewtime}</td>
        </tr>
    )
}

const ViewButton = (props) => {
    if(props.pw) {
        return (
            <Button variant="warning" size="sm" onClick={() => props.view(props.session.id, true)}><Icon.EyeSlashFill /></Button>
        )
    } else {
        return (
            <Button variant="info" size="sm" onClick={() => props.view(props.session.id, false)}><Icon.EyeFill /></Button>
        )
    }
}

const PdfButton = (props) => {
    if(props.pw) {
        return (
            <Button variant="warning" size="sm" onClick={() => props.view(props.session.id, true)}><Icon.FilePdfFill /></Button>
        )
    } else {
        return (
            <Button variant="info" size="sm" onClick={() => props.view(props.session.id, false)}><Icon.FilePdfFill /></Button>
        )
    }
}

function Login(props) {

    const viewerpwinput = useRef();
    const presenterpwinput = useRef();
    const viewsessionid = useRef();
    const resumesessionid = useRef();
    const sessionname = useRef();
    const ispublic = useRef();
    const searchField = useRef();
    const ENDPOINT = ((!process.env.NODE_ENV || process.env.NODE_ENV === 'development') ? "http://" : "https://") + window.location.hostname + ':8080';
    const [sessions, setSessions] = useState([]);
    const [filteredSessions, setFilteredSessions] = useState([]);
    const [searchString, setSearchString] = useState('');
    const [busyFetching, setBusyFetching] = useState(false);
    const [showIdWarning, setShowIdWarning] = useState(false);
    const [editId, setEditId] = useState('');
    const [viewId, setViewId] = useState('');
    const [newPresentationOK, setNewPresentationOK] = useState(false);

    const {items, requestSort, sortConfig} = useSortableData(filteredSessions);

    const getClassNamesFor = (name) => {
        if (!sortConfig) {
          return;
        }
        return sortConfig.key === name ? sortConfig.dir : undefined;
    };

    useEffect(() => {
        getSessionsList();
    }, []);

    // Apply filter whenever the original session list is refreshed
    useEffect(() => {
        filter();
    }, [sessions]);

    const checkPresentationOK = () => {
        setNewPresentationOK(sessionname.current.value.trim() !== '' && presenterpwinput.current.value.trim() !== '');
    }

    const getSessionsList = async () => {
        setBusyFetching(true);
        try {
            const resp = await fetch(ENDPOINT + `/sessions`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer null'
                }
            })
            if(!resp.ok) {
                return resp.status;
            } else {
                const json = await resp.json();
                setSessions(json);
                setBusyFetching(false);
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in getSessionsList: ' + error);
            setBusyFetching(false);
            return 500;
        }
    }

    const startNewSession = async () => {
        try {
            const resp = await fetch(ENDPOINT + `/login/0`, {
                method: 'POST',
                body: JSON.stringify({ 
                    sessionname: sessionname.current.value, 
                    ispublic: ispublic.current.checked, 
                    presenterpw: presenterpwinput.current.value, 
                    viewerpw: viewerpwinput.current.value }),
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer null'
                }
            })
            if(!resp.ok) {
                log(DEBUG_LEVELS.DEBUG, 'startNewSession, response: ' + resp);
                toast.error(resp.statusText);
            } else {
                const json = await resp.json();
                if(json.sessionInfo.id > 0) {
                    sessionStorage.setItem('presentertoken_' + json.sessionInfo.id, json.token);
                    props.goToSession(json.sessionInfo.id);
                } else {
                    return resp.status;
                }
                return resp.status;
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in startNewSession: ' + error);
            return 500;
        }
    }

    const enterSession = (id) => {
        const sid = typeof(id) === 'number' ? id : resumesessionid.current.value;
        props.goToSession(sid);
    }

    const viewSession = (id, promptpw=false) => {
        const sid = typeof(id) === 'number' ? id : viewsessionid.current.value;
        const session = sessions.find(session => session.id === parseInt(sid));
        
        if (session && session.has_pw) {
            promptpw = true;
        } else if (!session) {
            toast.error('Session not found!');
            return;
        }

        window.location.href = "/viewer.html?s=" + sid + ((!process.env.NODE_ENV || process.env.NODE_ENV === 'development') ? "&insecure=1" : "") + (promptpw ? "&promptpw=true" : "");
    }

    const filter = () => {
        const keyword = searchField.current.value;
    
        if (keyword !== '') {
            // Return anything that contains the search string
            const results = sessions.filter((session) => {
                return session.sessionname.toLowerCase().indexOf(keyword.toLowerCase()) > -1;
            });
            setFilteredSessions(results);
        } else {
            // Show all when field empty
            setFilteredSessions(sessions);
        }
        setSearchString(keyword);
    };

    const fetchPdf = async (sessionId) => {
        if(!Number.isInteger(sessionId)) {
            toast.error('Invalid presentation id!')
            return Promise.reject('Invalid presentation id!');
        }
        try{
            const resp = await fetch(ENDPOINT + `/boards2pdf/` + sessionId,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/pdf, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer null'
                }
            })
            if(resp.ok) {
                const blob = await resp.blob();
                download(blob, "boards_" + sessionId + ".pdf");
            } else {
                toast.error('Error creating pdf!')
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
        } catch (err) {
            toast.error('Error: ' + err)
        }
    };

    return (
        <Container className="bg-dark bg-gradient" fluid style={{ maxWidth: "2000px", padding: 20 }}>
            <Toaster position="bottom-center">
                {(t) => (
                <ToastBar toast={t}>
                {({ icon, message }) => (
                    <>
                    {icon}
                    {message}
                    {t.type !== 'loading' && (
                        <button onClick={() => toast.dismiss(t.id)}>X</button>
                    )}
                    </>
                )}
                </ToastBar>
            )}
            </Toaster>
            <Row>
            <Col sm={6}>
            <h1 className="display-3">Liitutaulu 2.0</h1>
            </Col>
            <Col sm={6}>
            <p><Button variant="info" size="sm"><Icon.EyeFill /></Button> = view presentation ( <Button variant="warning" size="sm"><Icon.EyeSlashFill /></Button> = password required) <Button size="sm"><Icon.Pencil /></Button> = edit presentation</p>
            <p>Click on column header buttons to sort by column. Filter titles by typing in the box.</p>
            </Col>
            </Row>
            <Row>
            <Col sm={6}>
            <div className="sidebar-box">
            <h2 className="float-end"><Icon.Pencil /></h2>
            <h2 className="mb-2 display-5">Create a new presentation</h2>
            <p>If you don't have a presentation yet, start a new one below.</p>
            <Row>
            <Col xs={9}>
            <FormControl 
                className="mb-2"
                ref={sessionname}
                id="sessionname"
                type="text"
                placeholder="Descriptive title for presentation (required)"
                autoComplete="off"
                onChange={checkPresentationOK}
            />
            <FormControl 
                className="mb-2"
                ref={presenterpwinput}
                id="presenterpw"
                type="text"
                placeholder="Presenter password (required, please remember it!)"
                autoComplete="off"
                onChange={checkPresentationOK}
            />
            <FormControl 
                className="mb-4"
                ref={viewerpwinput}
                id="viewerpw"
                type="text"
                placeholder="Viewer password (optional)"
                autoComplete="off"
            />
            </Col>
            <Col sm={3}>
            <Form.Check onClick={(e) => setShowIdWarning(!e.target.checked)} className="mb-4" ref={ispublic} type="checkbox" id="ispublic" label="Show in list" defaultChecked></Form.Check>
            {showIdWarning && <div className="alert alert-danger">
            <small><strong>Important:</strong> Take note of the presentation id (number in the address bar) to resume it later!</small>
            </div>}
            <Button className="mb-5" onClick={startNewSession} disabled={!newPresentationOK}>Create presentation</Button>
            </Col>
            </Row>
            <h2 className="mb-2 display-5">Edit presentation by id</h2>
            <p>If you have an existing (possibly unlisted) presentation, you can edit it by entering its id below.</p>
            <InputGroup >
                <FormControl 
                    ref={resumesessionid}
                    id="resumesessionid"
                    type="number"
                    placeholder="Enter a presentation id to edit"
                    onChange={(e) => setEditId(e.target.value)}
                />
                <Button onClick={enterSession} disabled={editId === ''}>Edit presentation</Button>
            </InputGroup>
            <small>You will be asked for the presentation password in the next step.</small>
            </div>
            <div className="sidebar-box">
            <h2 className="float-end"><Icon.Eye /></h2>
            <h2 className="mb-2 display-5">View presentation by id</h2>
            <p>If the presentation you wish to join is unlisted, or you cannot find it, you can join by presentation id below.</p>
            <InputGroup>
                <FormControl 
                    ref={viewsessionid}
                    id="viewsessionid"
                    type="number"
                    placeholder="Enter a presentation id to view"
                    onChange={(e) => setViewId(e.target.value)}
                />
                <Button variant="info" onClick={viewSession} disabled={viewId === ''}>View presentation</Button>
            </InputGroup>
            <small>You will be asked for the presentation viewer password in the next step.</small>
            </div>
            </Col>
            <Col sm={6} style={{ maxHeight: "calc(100vh - 155px)", overflowY: "scroll", maskImage: "linear-gradient(to bottom, black calc(100% - 48px), transparent 100%)" }}>
                <table className="table table-striped">
                    <thead className="sticky-top">
                        <tr className="table-dark">
                            <td width="85px"><Button onClick={getSessionsList}>{busyFetching ? <span className="spinner-border spinner-border-sm"></span> : <Icon.ArrowClockwise />}</Button></td>
                            <td><Button onClick={() => requestSort('id')} className={getClassNamesFor('id')}>Id</Button></td>
                            <td>
                            <InputGroup>
                                <Button onClick={() => requestSort('sessionname')} className={getClassNamesFor('sessionname')}>Title</Button>
                                <FormControl
                                    type="search"
                                    ref={searchField}
                                    value={searchString}
                                    onChange={filter}
                                    className="input"
                                    placeholder="Filter"
                                />
                            </InputGroup>
                            </td>
                            <td><Button onClick={() => requestSort('lastlogin')} className={getClassNamesFor('lastlogin')}>Last edited</Button></td>
                            <td><Button onClick={() => requestSort('lastview')} className={getClassNamesFor('lastview')}>Last viewed</Button></td>
                        </tr>
                    </thead>
                    <tbody>
                    <Sessions sessions={items} view={viewSession} present={enterSession}></Sessions>
                    </tbody>
                </table>
            </Col>
            </Row>
        </Container >
    )
}

export default Login;
