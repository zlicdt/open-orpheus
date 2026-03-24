use font_kit::source::SystemSource;
use neon::{
    object::Object,
    prelude::{Context, Cx},
    result::JsResult,
    types::JsArray,
};

#[neon::export]
fn get_system_fonts<'cx>(cx: &mut Cx<'cx>) -> JsResult<'cx, JsArray> {
    let src = SystemSource::new();

    let families = src
        .all_families()
        .or_else(|x| cx.throw_error(x.to_string()))?;

    let arr = cx.empty_array();

    for (i, family) in families.into_iter().enumerate() {
        let val = cx.string(family);
        arr.set(cx, i as u32, val)?;
    }

    Ok(arr)
}
