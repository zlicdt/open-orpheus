use neon::{
    event::Channel,
    handle::Handle,
    object::Object,
    prelude::{Context, Cx, JsFunction, ModuleContext},
    result::NeonResult,
    types::JsValue,
    types::{JsBuffer, buffer::TypedArray},
};
#[cfg(target_arch = "x86_64")]
use std::sync::OnceLock;

mod dynload;
#[cfg(target_arch = "x86_64")]
mod wayland;
mod x11;

#[cfg(target_arch = "x86_64")]
static DISABLE_WAYLAND_HOOKS: OnceLock<bool> = OnceLock::new();

#[cfg(target_arch = "x86_64")]
fn disable_wayland_hooks() -> bool {
    *DISABLE_WAYLAND_HOOKS.get_or_init(|| {
        std::env::var("DISABLE_WAYLAND_HOOKS")
            .ok()
            .map(|v| {
                let value = v.trim().to_ascii_lowercase();
                !value.is_empty() && value != "0" && value != "false" && value != "no"
            })
            .unwrap_or(false)
    })
}

#[neon::export]
fn is_wayland() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        wayland::is_wayland()
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}

#[neon::export]
fn get_last_created_window_id() -> Option<String> {
    #[cfg(target_arch = "x86_64")]
    {
        wayland::get_last_created_window_id()
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        None
    }
}

#[neon::export]
fn drag_window<'cx>(cx: &mut Cx<'cx>, handle: Handle<JsBuffer>) -> NeonResult<()> {
    #[cfg(target_arch = "x86_64")]
    if wayland::is_wayland() {
        wayland::send_xdg_toplevel_move();
        return Ok(());
    }

    let buf = handle.as_slice(cx);
    if buf.len() != 4 {
        let err_msg = cx.string("Invalid buffer size for window handle");
        return cx.throw(err_msg);
    }
    let Some(window) = buf
        .get(0..4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()) as u64)
    else {
        let err_msg = cx.string("Failed to parse window handle");
        return cx.throw(err_msg);
    };

    if let Err(err) = x11::send_net_wm_moveresize_move(window) {
        let err_msg = cx.string(format!(
            "Failed to send net wm moveresize move event: {}",
            err
        ));
        return cx.throw(err_msg);
    }

    Ok(())
}

#[neon::export]
fn capture_next_window_first_cursor_enter<'cx>(
    cx: &mut Cx<'cx>,
    callback: Handle<'cx, JsFunction>,
) -> NeonResult<()> {
    #[cfg(target_arch = "x86_64")]
    {
        if disable_wayland_hooks() {
            let err_msg = cx.string(
                "captureNextWindowFirstCursorEnter is unavailable when Wayland hooks are disabled",
            );
            return cx.throw(err_msg);
        }

        let channel: Channel = cx.channel();
        let callback = callback.root(cx);
        if !wayland::on_next_new_window_first_cursor_enter(move |x, y| {
            channel.send(move |mut cx| {
                let callback = callback.into_inner(&mut cx);
                let this = cx.undefined();
                let args: [Handle<JsValue>; 2] =
                    [cx.number(x as f64).upcast(), cx.number(y as f64).upcast()];
                callback.call(&mut cx, this, args)?;
                Ok(())
            });
        }) {
            let err_msg = cx.string(
                "captureNextWindowFirstCursorEnter is unavailable because Wayland hooks are not initialized",
            );
            return cx.throw(err_msg);
        }

        return Ok(());
    }

    #[cfg(not(target_arch = "x86_64"))]
    {
        let err_msg =
            cx.string("captureNextWindowFirstCursorEnter is only supported on Linux x86_64");
        cx.throw(err_msg)
    }
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    neon::registered().export(&mut cx)?;

    #[cfg(target_arch = "x86_64")]
    if !disable_wayland_hooks() {
        wayland::init_wayland_hook();
    }

    Ok(())
}

#[unsafe(no_mangle)]
pub extern "C" fn on_unload() {
    #[cfg(target_arch = "x86_64")]
    if !disable_wayland_hooks() {
        wayland::remove_wayland_hook();
    }
}

#[used]
#[unsafe(link_section = ".fini_array")]
static DESTRUCTOR: extern "C" fn() = on_unload;
