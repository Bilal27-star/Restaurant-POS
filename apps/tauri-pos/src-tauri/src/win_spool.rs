//! Windows print spooler — RAW ESC/POS to a named queue (e.g. XPrinter USB).
//! API bindings match `windows` crate **0.58** (`Win32_Graphics_Printing`, `Win32_Foundation`, `Win32_Graphics_Gdi`).

use core::ffi::c_void;

use windows::core::{Error, PCWSTR, PWSTR};
use windows::Win32::Foundation::{BOOL, GetLastError, HANDLE};
use windows::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
    StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
    PRINTER_INFO_1W,
};

fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn pwstr_from_wide(wide: &mut [u16]) -> PWSTR {
    PWSTR::from_raw(wide.as_mut_ptr())
}

/// Win32 APIs that return `BOOL` expose `.ok()` on windows 0.58 (not `.is_err()`).
fn bool_result(b: BOOL, context: &str) -> Result<(), String> {
    b.ok().map_err(|e| format!("{context}: {e}"))
}

fn core_result<T>(result: Result<T, Error>, context: &str) -> Result<T, String> {
    result.map_err(|e| format!("{context}: {e}"))
}

fn close_printer_quiet(h: HANDLE) {
    let _ = unsafe { ClosePrinter(h) };
}

/// Installed Windows printer queue names (local + connections).
pub fn list_installed_printers() -> Result<Vec<String>, String> {
    unsafe {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: u32 = 0;
        let mut count: u32 = 0;

        // First call: probe buffer size (expected failure when `pprinterenum` is None).
        let _ = EnumPrintersW(
            flags,
            PCWSTR::null(),
            1,
            None,
            &mut needed,
            &mut count,
        );

        if needed == 0 {
            return Ok(vec![]);
        }

        let mut buf = vec![0u8; needed as usize];
        core_result(
            EnumPrintersW(
                flags,
                PCWSTR::null(),
                1,
                Some(buf.as_mut_slice()),
                &mut needed,
                &mut count,
            ),
            "EnumPrintersW",
        )?;

        let mut names = Vec::new();
        if count > 0 {
            let base = buf.as_ptr() as *const PRINTER_INFO_1W;
            for i in 0..count as usize {
                let info = &*base.add(i);
                if info.pName.is_null() {
                    continue;
                }
                let name = info
                    .pName
                    .to_string()
                    .map_err(|e| format!("printer name decode: {e}"))?;
                let trimmed = name.trim();
                if !trimmed.is_empty() {
                    names.push(trimmed.to_string());
                }
            }
        }
        names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        names.dedup();
        Ok(names)
    }
}

/// Sends raw bytes to `printer_name` using datatype RAW (ESC/POS).
pub fn print_raw_winspool(printer_name: &str, payload: &[u8]) -> Result<(), String> {
    if printer_name.trim().is_empty() {
        return Err("winspool: printerName is empty".into());
    }
    if payload.is_empty() {
        return Err("empty print payload".into());
    }

    unsafe {
        let name_w = wide_null(printer_name.trim());
        let mut h_printer = HANDLE::default();
        core_result(
            OpenPrinterW(PCWSTR::from_raw(name_w.as_ptr()), &mut h_printer, None),
            &format!("OpenPrinter({printer_name})"),
        )?;

        let mut doc_name = wide_null("Restaurant POS");
        let mut data_type = wide_null("RAW");
        let doc_info = DOC_INFO_1W {
            pDocName: pwstr_from_wide(&mut doc_name),
            pOutputFile: PWSTR::null(),
            pDatatype: pwstr_from_wide(&mut data_type),
        };

        let job = StartDocPrinterW(h_printer, 1, &doc_info);
        if job == 0 {
            let code = GetLastError().0;
            close_printer_quiet(h_printer);
            return Err(format!("StartDocPrinter({printer_name}): GetLastError={code}"));
        }

        if let Err(e) = bool_result(StartPagePrinter(h_printer), "StartPagePrinter") {
            let _ = EndDocPrinter(h_printer);
            close_printer_quiet(h_printer);
            return Err(format!("{e} ({printer_name})"));
        }

        let mut written: u32 = 0;
        let write_ok = WritePrinter(
            h_printer,
            payload.as_ptr() as *const c_void,
            payload.len() as u32,
            &mut written,
        );
        if let Err(e) = bool_result(write_ok, "WritePrinter") {
            let _ = EndPagePrinter(h_printer);
            let _ = EndDocPrinter(h_printer);
            close_printer_quiet(h_printer);
            return Err(format!("{e} ({printer_name})"));
        }
        if written != payload.len() as u32 {
            let _ = EndPagePrinter(h_printer);
            let _ = EndDocPrinter(h_printer);
            close_printer_quiet(h_printer);
            return Err(format!(
                "WritePrinter({printer_name}): wrote {written} of {} bytes",
                payload.len()
            ));
        }

        let _ = bool_result(EndPagePrinter(h_printer), "EndPagePrinter");
        let _ = bool_result(EndDocPrinter(h_printer), "EndDocPrinter");
        core_result(ClosePrinter(h_printer), &format!("ClosePrinter({printer_name})"))?;
        Ok(())
    }
}
