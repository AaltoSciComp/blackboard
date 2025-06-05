// adapted from https://github.com/tajo/react-portal/blob/55ed77ab823b03d1d4c45b950ba26ea5d687e85c/src/LegacyPortal.js

import React from "react";
import { createRoot } from 'react-dom/client';

export default class Portal extends React.Component {

  componentDidMount() {
    this.renderPortal();
  }

  componentDidUpdate(props) {
    this.renderPortal();
  }

  componentWillUnmount() {
    // Add a small timeout to avoid React complaints about unmounting a root while rendering
    // TODO: find a proper way to fix this
    setTimeout(() => {this.root.unmount()}, 200);
    if (this.defaultNode) {
      document.body.removeChild(this.defaultNode);
    }
    this.defaultNode = null;
  }

  renderPortal(props) {
    if (!this.props.node && !this.defaultNode) {
      this.defaultNode = document.createElement("div");
      this.root = createRoot(this.defaultNode);
      document.body.appendChild(this.defaultNode);
    }

    let children = this.props.children;
    // https://gist.github.com/jimfb/d99e0678e9da715ccf6454961ef04d1b
    if (typeof children.type === "function") {
      children = React.cloneElement(children);
    }

    this.root.render(children);
  }

  render() {
    return null;
  }
}
