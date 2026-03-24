use std::sync::Arc;

use neon::{
    handle::{Handle, Root},
    object::Object,
    prelude::{Context, Cx},
    types::{JsFunction, extract::Json},
};

use crate::{
    app::App,
    components::menu::{Menu, MenuData, MenuItemPatch},
};

/// Creates a `Menu` and returns an opaque pointer to it.
#[neon::export]
fn create_menu(app_ptr: f64, menu_data: Json<MenuData>) -> f64 {
    let app = unsafe { &*(app_ptr as usize as *mut App) };
    let menu = Box::new(Menu::new(app, menu_data.0));
    Box::into_raw(menu) as usize as f64
}

/// Drops the `Menu` referenced by `menu_ptr`.
#[neon::export]
fn destroy_menu(menu_ptr: f64) {
    let _ = unsafe { Box::from_raw(menu_ptr as usize as *mut Menu) };
}

/// Shows the menu referenced by `menu_ptr`.
#[neon::export]
fn show_menu(menu_ptr: f64) {
    let menu = unsafe { &*(menu_ptr as usize as *const Menu) };
    menu.show();
}

/// Registers a JS callback fired whenever a menu item is clicked.
/// The callback receives the item's `menu_id` (text rows) or button
/// `id` (icon-button rows) as its first argument.
#[neon::export]
fn set_menu_on_click<'cx>(cx: &mut Cx<'cx>, menu_ptr: f64, callback: Handle<'cx, JsFunction>) {
    let menu = unsafe { &mut *(menu_ptr as usize as *mut Menu) };
    let callback: Arc<Root<JsFunction>> = Arc::new(callback.root(cx));
    let channel = cx.channel();
    menu.set_click_handler(move |id| {
        let callback = callback.clone();
        let channel = channel.clone();
        let id = id.to_owned();
        channel.send(move |mut cx| {
            let cb = callback.to_inner(&mut cx);
            let id_arg = cx.string(&id);
            cb.call_with(&cx).arg(id_arg).exec(&mut cx)?;
            Ok(())
        });
    });
}

/// Updates a menu item in a live menu using a partial patch.
/// Only fields set to `Some(v)` in the patch are changed; the target item is
/// identified by `patch.menu_id` (no-op if absent).
#[neon::export]
fn update_menu_item(menu_ptr: f64, item: Json<MenuItemPatch>) {
    let menu = unsafe { &*(menu_ptr as usize as *const Menu) };
    menu.update_item(item.0);
}
