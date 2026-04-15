#![allow(dead_code)]

use crate::dynamic_fn;

use std::ffi::{c_char, c_int, c_long, c_short, c_uint, c_ulong, c_void};

pub type Display = c_void;
pub type Window = c_ulong;
pub type Atom = c_ulong;
pub type Time = c_ulong;
pub type Bool = c_int;
pub type Status = c_int;

pub(super) const CLIENT_MESSAGE: c_int = 33;
pub(super) const SUBSTRUCTURE_NOTIFY_MASK: c_long = 1 << 19;
pub(super) const SUBSTRUCTURE_REDIRECT_MASK: c_long = 1 << 20;

#[derive(Clone, Copy)]
#[repr(C)]
pub(super) union XClientMessageData {
    pub b: [c_char; 20],
    pub s: [c_short; 10],
    pub l: [c_long; 5],
}

#[derive(Clone, Copy)]
#[repr(C)]
pub(super) struct XClientMessageEvent {
    pub type_: c_int,
    pub serial: c_ulong,
    pub send_event: Bool,
    pub display: *mut Display,
    pub window: Window,
    pub message_type: Atom,
    pub format: c_int,
    pub data: XClientMessageData,
}

#[derive(Clone, Copy)]
#[repr(C)]
pub(super) union XEvent {
    pub type_: c_int,
    pub xclient: XClientMessageEvent,
    pub pad: [c_long; 24],
}

pub(super) struct NetWmMoveResizePayload {
    pub x_root: c_long,
    pub y_root: c_long,
    pub direction: c_long,
    pub button: c_long,
    pub source_indication: c_long,
}

pub(super) fn make_net_wm_moveresize_event(
    display: *mut Display,
    window: Window,
    net_wm_moveresize_atom: Atom,
    payload: NetWmMoveResizePayload,
) -> XEvent {
    XEvent {
        xclient: XClientMessageEvent {
            type_: CLIENT_MESSAGE,
            serial: 0,
            send_event: 1,
            display,
            window,
            message_type: net_wm_moveresize_atom,
            format: 32,
            data: XClientMessageData {
                l: [
                    payload.x_root,
                    payload.y_root,
                    payload.direction,
                    payload.button,
                    payload.source_indication,
                ],
            },
        },
    }
}

type XOpenDisplayFn = unsafe extern "C" fn(*const c_char) -> *mut Display;
type XUngrabPointerFn = unsafe extern "C" fn(*mut Display, Time) -> c_int;
type XQueryPointerFn = unsafe extern "C" fn(
    *mut Display,
    Window,
    *mut Window,
    *mut Window,
    *mut c_int,
    *mut c_int,
    *mut c_int,
    *mut c_int,
    *mut c_uint,
) -> Bool;
type XInternAtomFn = unsafe extern "C" fn(*mut Display, *const c_char, Bool) -> Atom;
type XSendEventFn = unsafe extern "C" fn(*mut Display, Window, Bool, c_long, *mut XEvent) -> Status;
type XFlushFn = unsafe extern "C" fn(*mut Display) -> c_int;
type XDefaultRootWindowFn = unsafe extern "C" fn(*mut Display) -> Window;
type XCloseDisplayFn = unsafe extern "C" fn(*mut Display) -> c_int;

dynamic_fn!(pub x_open_display, XOpenDisplayFn, "XOpenDisplay");
dynamic_fn!(pub x_ungrab_pointer, XUngrabPointerFn, "XUngrabPointer");
dynamic_fn!(pub x_query_pointer, XQueryPointerFn, "XQueryPointer");
dynamic_fn!(pub x_intern_atom, XInternAtomFn, "XInternAtom");
dynamic_fn!(pub x_send_event, XSendEventFn, "XSendEvent");
dynamic_fn!(pub x_flush, XFlushFn, "XFlush");
dynamic_fn!(pub x_default_root_window, XDefaultRootWindowFn, "XDefaultRootWindow");
dynamic_fn!(pub x_close_display, XCloseDisplayFn, "XCloseDisplay");

pub fn send_net_wm_moveresize_move(window: u64) -> Result<(), String> {
    let Ok(x_open_display) = x_open_display() else {
        return Err("Failed to resolve XOpenDisplay".into());
    };
    let Ok(x_ungrab_pointer) = x_ungrab_pointer() else {
        return Err("Failed to resolve XUngrabPointer".into());
    };
    let Ok(x_query_pointer) = x_query_pointer() else {
        return Err("Failed to resolve XQueryPointer".into());
    };
    let Ok(x_intern_atom) = x_intern_atom() else {
        return Err("Failed to resolve XInternAtom".into());
    };
    let Ok(x_send_event) = x_send_event() else {
        return Err("Failed to resolve XSendEvent".into());
    };
    let Ok(x_flush) = x_flush() else {
        return Err("Failed to resolve XFlush".into());
    };
    let Ok(x_default_root_window) = x_default_root_window() else {
        return Err("Failed to resolve XDefaultRootWindow".into());
    };
    let Ok(x_close_display) = x_close_display() else {
        return Err("Failed to resolve XCloseDisplay".into());
    };

    let display = unsafe { x_open_display(std::ptr::null()) };
    if display.is_null() {
        return Err("Failed to open X display".into());
    }

    let mut root_return: Window = 0;
    let mut child_return: Window = 0;
    let mut root_x: c_int = 0;
    let mut root_y: c_int = 0;
    let mut win_x: c_int = 0;
    let mut win_y: c_int = 0;
    let mut mask_return: c_uint = 0;

    let query_ok = unsafe {
        x_query_pointer(
            display,
            window,
            &mut root_return,
            &mut child_return,
            &mut root_x,
            &mut root_y,
            &mut win_x,
            &mut win_y,
            &mut mask_return,
        )
    };
    if query_ok == 0 {
        return Err("Failed to query pointer on X display".into());
    }

    let net_wm_moveresize_atom =
        unsafe { x_intern_atom(display, c"_NET_WM_MOVERESIZE".as_ptr(), 0) };
    if net_wm_moveresize_atom == 0 {
        return Err("Failed to intern _NET_WM_MOVERESIZE atom on X display".into());
    }

    let payload = NetWmMoveResizePayload {
        x_root: root_x as c_long,
        y_root: root_y as c_long,
        direction: 8,         // _NET_WM_MOVERESIZE_MOVE
        button: 1,            // left mouse button
        source_indication: 1, // _NET_WM_MOVERESIZE_SOURCE_INDICATION
    };
    let mut event = make_net_wm_moveresize_event(display, window, net_wm_moveresize_atom, payload);

    unsafe { x_ungrab_pointer(display, 0) };
    unsafe { x_flush(display) };

    let root = unsafe { x_default_root_window(display) };
    let send_ok = unsafe {
        x_send_event(
            display,
            root,
            0,
            SUBSTRUCTURE_NOTIFY_MASK | SUBSTRUCTURE_REDIRECT_MASK,
            &mut event,
        )
    };
    if send_ok == 0 {
        return Err("Failed to send _NET_WM_MOVERESIZE client message to X display".into());
    }

    unsafe { x_flush(display) };
    unsafe { x_close_display(display) };

    Ok(())
}
