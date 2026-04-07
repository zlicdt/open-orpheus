use egui::{FontData, FontDefinitions, FontFamily};
use font_kit::source::SystemSource;

#[cfg(target_os = "linux")]
use std::process::Command;

const DEFAULT_FONTS: &[&str] = &[
    "Noto Sans CJK SC",
    "Microsoft YaHei",
    "PingFang SC",
    "Source Han Sans SC",
    "WenQuanYi Micro Hei",
];

pub fn get_font_definitions() -> FontDefinitions {
    let mut fonts = FontDefinitions::default();

    let system_source = SystemSource::new();
    let mut candidates: Vec<String> = DEFAULT_FONTS.iter().map(|s| (*s).to_string()).collect();

    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("fc-match")
            .args(["-f", "%{family}\n", "sans-serif:lang=zh-cn"])
            .output()
        {
            if output.status.success() {
                let output_text = String::from_utf8_lossy(&output.stdout);
                let first_line = output_text.lines().next().unwrap_or_default();
                let fc_fonts = first_line.split(',').next().unwrap_or_default().trim();

                if !fc_fonts.is_empty() && !candidates.iter().any(|f| f.as_str() == fc_fonts) {
                    candidates.insert(0, fc_fonts.to_string());
                }
            }
        }
    }

    'search_font: for font_name in candidates {
        if let Ok(handles) = system_source.select_family_by_name(&font_name) {
            for handle in handles.fonts() {
                if let Ok(font) = handle.load() {
                    let Some(font_data) = font.copy_font_data() else {
                        continue;
                    };
                    fonts.font_data.insert(
                        font_name.clone(),
                        std::sync::Arc::new(FontData::from_owned(font_data.to_vec())),
                    );

                    if let Some(family) = fonts.families.get_mut(&FontFamily::Proportional)
                        && !family.iter().any(|name| name == &font_name)
                    {
                        family.insert(0, font_name.clone());
                    }
                    break 'search_font;
                }
            }
        }
    }

    fonts
}
