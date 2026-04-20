use neon::prelude::Context;
use neon::{
    handle::Handle,
    prelude::Cx,
    result::NeonResult,
    types::{JsBuffer, buffer::TypedArray},
};
use objc2::{class, msg_send, runtime::AnyObject, sel};
use objc2_foundation::NSPoint;

unsafe fn create_drag_event(window: *mut AnyObject) -> *mut AnyObject {
    let local: NSPoint = unsafe { msg_send![window, mouseLocationOutsideOfEventStream] };
    let now: f64 = unsafe { msg_send![class!(NSDate), timeIntervalSinceReferenceDate] };
    let window_number: isize = unsafe { msg_send![window, windowNumber] };
    unsafe {
        msg_send![class!(NSEvent),
            mouseEventWithType: 1usize,
            location: local,
            modifierFlags: 0usize,
            timestamp: now,
            windowNumber: window_number,
            context: std::ptr::null_mut::<AnyObject>(),
            eventNumber: 0isize,
            clickCount: 1isize,
            pressure: 1.0f32,
        ]
    }
}

#[neon::export]
fn drag_window<'cx>(cx: &mut Cx<'cx>, hwnd: Handle<JsBuffer>) -> NeonResult<()> {
    let hwnd = hwnd.as_slice(cx);
    if hwnd.len() < std::mem::size_of::<usize>() {
        let err_msg = cx.string("Invalid buffer size for native handle");
        return cx.throw(err_msg);
    }

    let mut bytes = [0u8; std::mem::size_of::<usize>()];
    bytes.copy_from_slice(&hwnd[..std::mem::size_of::<usize>()]);
    let view = usize::from_ne_bytes(bytes) as *mut AnyObject;
    if view.is_null() {
        let err_msg = cx.string("Null native pointer");
        return cx.throw(err_msg);
    }

    let window: *mut AnyObject = unsafe { msg_send![view, window] };
    if window.is_null() {
        let err_msg = cx.string("Could not resolve NSWindow from NSView handle");
        return cx.throw(err_msg);
    }

    let can_drag: bool =
        unsafe { msg_send![window, respondsToSelector: sel!(performWindowDragWithEvent:)] };
    if !can_drag {
        let err_msg = cx.string("performWindowDragWithEvent is unavailable on this system");
        return cx.throw(err_msg);
    }

    unsafe {
        let event = create_drag_event(window);
        let _: () = msg_send![window, performWindowDragWithEvent: event];
    }

    Ok(())
}
