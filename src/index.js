import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { findDOMNode } from 'react-dom';
import throttle from 'lodash.throttle';
import raf from 'raf';
import getDisplayName from 'react-display-name';
import hoist from 'hoist-non-react-statics';
import { noop, intBetween } from './util';

const DEFAULT_BUFFER = 150;

export function createHorizontalStrength(_buffer) {
  return function defaultHorizontalStrength({ x, w }, point) {
    const buffer = Math.min(w / 2, _buffer);

    if (point.x >= x && point.x <= x + w) {
      if (point.x < x + buffer) {
        return (point.x - x - buffer) / buffer;
      } else if (point.x > (x + w - buffer)) {
        return -(x + w - point.x - buffer) / buffer;
      }
    }

    return 0;
  };
}

export function createVerticalStrength(_buffer) {
  return function defaultVerticalStrength({ y, h }, point) {
    const buffer = Math.min(h / 2, _buffer);

    if (point.y >= y && point.y <= y + h) {
      if (point.y < y + buffer) {
        return (point.y - y - buffer) / buffer;
      } else if (point.y > (y + h - buffer)) {
        return -(y + h - point.y - buffer) / buffer;
      }
    }

    return 0;
  };
}

export const defaultHorizontalStrength = createHorizontalStrength(DEFAULT_BUFFER);

export const defaultVerticalStrength = createVerticalStrength(DEFAULT_BUFFER);


export default function createScrollingComponent(WrappedComponent) {
  class ScrollingComponent extends Component {

    static displayName = `Scrolling(${getDisplayName(WrappedComponent)})`;

    static propTypes = {
      onScrollChange: PropTypes.func,
      verticalStrength: PropTypes.func,
      horizontalStrength: PropTypes.func,
      speed: PropTypes.number,
    };

    static defaultProps = {
      onScrollChange: noop,
      verticalStrength: defaultVerticalStrength,
      horizontalStrength: defaultHorizontalStrength,
      speed: 30,
    };

    constructor(props, ctx) {
      super(props, ctx);

      this.scaleX = 0;
      this.scaleY = 0;
      this.frame = null;
      this.attached = false;
    }

    componentDidMount() {
      this.container = findDOMNode(this.wrappedInstance);
      this.container.addEventListener('dragover', this.handleDragOver);
    }

    componentWillUnmount() {
      if (this.frame) raf.cancel(this.frame);
      this.detach();
    }

    attach() {
      window.document.body.addEventListener('dragover', this.updateScrolling);
      window.document.body.addEventListener('dragend', this.stopScrolling);
      window.document.body.addEventListener('drop', this.stopScrolling);
      this.attached = true;
    }

    detach() {
      window.document.body.removeEventListener('dragover', this.updateScrolling);
      window.document.body.removeEventListener('dragend', this.stopScrolling);
      window.document.body.removeEventListener('drop', this.stopScrolling);
      this.attached = false;
    }

    // we don't care about the body's dragover events until this
    // component gets dragged over for the first time
    handleDragOver = (evt, ...rest) => {
      // give users a chance to preventDefault
      if (typeof this.props.onDragOver === 'function') this.props.onDragOver(evt, ...rest);

      if (!this.attached) {
        this.attach();
        this.updateScrolling(evt);
      }
    }

    // Update scaleX and scaleY every 100ms or so
    // and start scrolling if necessary
    updateScrolling = throttle(evt => {
      const { left: x, top: y, width: w, height: h } = this.container.getBoundingClientRect();
      const box = { x, y, w, h };
      const coords = { x: evt.clientX, y: evt.clientY };

      // calculate strength
      this.scaleX = this.props.horizontalStrength(box, coords);
      this.scaleY = this.props.verticalStrength(box, coords);

      // start scrolling if we need to
      if (!this.frame && (this.scaleX || this.scaleY)) this.startScrolling();
    }, 100, { trailing: false })

    startScrolling() {
      let i = 0;
      const tick = () => {
        const { scaleX, scaleY, container } = this;
        const { speed, onScrollChange } = this.props;

        // stop scrolling if there's nothing to do
        if (speed === 0 || scaleX + scaleY === 0) {
          this.stopScrolling();
          return;
        }

        // there's a bug in safari where it seems like we can't get
        // dragover events from a container that also emits a scroll
        // event that same frame. So we double the speed and only adjust
        // the scroll position at 30fps
        if (i++ % 2) {
          const {
            scrollLeft,
            scrollTop,
            scrollWidth,
            scrollHeight,
            clientWidth,
            clientHeight,
          } = container;

          const newLeft = scaleX
            ? container.scrollLeft = intBetween(
              0,
              scrollWidth - clientWidth,
              scrollLeft + scaleX * speed
            )
            : scrollLeft;

          const newTop = scaleY
            ? container.scrollTop = intBetween(
              0,
              scrollHeight - clientHeight,
              scrollTop + scaleY * speed
            )
            : scrollTop;

          onScrollChange(newLeft, newTop);
        }
        this.frame = raf(tick);
      };

      tick();
    }

    stopScrolling = () => {
      if (this.frame) {
        this.detach();
        raf.cancel(this.frame);
        this.frame = null;
        this.scaleX = 0;
        this.scaleY = 0;
      }
    }

    render() {
      const {
        // not passing down these props
        speed,
        verticalStrength,
        horizontalStrength,
        onScrollChange,

        ...props,
      } = this.props;

      return (
        <WrappedComponent
          ref={(ref) => { this.wrappedInstance = ref; }}
          {...props}
        />
      );
    }
  }

  return hoist(ScrollingComponent, WrappedComponent);
}
