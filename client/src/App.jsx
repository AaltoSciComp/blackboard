import React from 'react';
import { Route, Routes, useParams, useNavigate } from "react-router-dom";
//import { createBrowserHistory as createHistory } from "history";
import Blackboard from "./Blackboard";
import Login from "./components/Login";

function App() {
  let navigate = useNavigate();

  function goToSession(id) {
    navigate("/" + id);
  }
  /*function goHome() {
    navigate("/");
  }*/
  return (
    <Routes goToSession={goToSession}>
      <Route goToSession={goToSession} path="/" element={<Login goToSession={goToSession} />} />
      <Route path="/:id" element={<Child />} />
    </Routes>
  );
}

function Child() {
  // We can use the `useParams` hook here to access
  // the dynamic pieces of the URL.
  let { id } = useParams();

  return (
    <div>
      <Blackboard sid={id} />
    </div>
  );
}

export default App;
