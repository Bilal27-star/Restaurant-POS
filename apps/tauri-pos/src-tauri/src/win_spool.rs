//! Windows print spooler — RAW ESC/POS to a named queue (e.g. XPrinter USB).

use windows::core::PCWSTR;
use windows::Win32::Foundation::GetLastError;
use windows::Win32::Graphics::Printing::{
    ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
    StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
    PRINTER_INFO_1W,
};

fn wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Installed Windows printer queue names (local + connections).
pub fn list_installed_printers() -> Result<Vec<String>, String> {
    unsafe {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: u32 = 0;
        let mut count: u32 = 0;
        let _ = EnumPrintersW(
            flags,
            None,
            1,
            None,
            0,
            &mut needed,
            &mut count,
        );
        if needed == 0 {
            return Ok(vec![]);
        }
        let mut buf = vec![0u8; needed as usize];
        EnumPrintersW(
            flags,
            None,
            1,
            Some(buf.as_mut_ptr()),
            needed,
            &mut needed,
            &mut count,
        )
        .map_err(|e| format!("EnumPrintersW failed: {e}"))?;

        let base = buf.as_ptr() as *const PRINTER_INFO_1W;
        let mut names = Vec::new();
        for i in 0..count {
            let info = &*base.add(i as usize);
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
        let mut h_printer = Default::default();
        OpenPrinterW(PCWSTR(name_w.as_ptr()), &mut h_printer, None)
            .map_err(|e| format!("OpenPrinter({printer_name}): {e}"))?;

        let doc_name = wide_null("Restaurant POS");
        let data_type = wide_null("RAW");
        let doc_info = DOC_INFO_1W {
            pDocName: PCWSTR(doc_name.as_ptr()),
            pOutputFile: PCWSTR::null(),
            pDatatype: PCWSTR(data_type.as_ptr()),
        };

        let job = StartDocPrinterW(h_printer, 1, &doc_info as *const _ as *const u8);
        if job == 0 {
            let err = GetLastError();
            let _ = ClosePrinter(h_printer);
            return Err(format!("StartDocPrinter({printer_name}): {err:?}"));
        }

        if StartPagePrinter(h_printer).is_err() {
            let _ = EndDocPrinter(h_printer);
            let _ = ClosePrinter(h_printer);
            return Err(format!("StartPagePrinter({printer_name}) failed"));
        }

        let mut written: u32 = 0;
        let ok = WritePrinter(
            h_printer,
            payload.as_ptr() as *const _,
            payload.len() as u32,
            &mut written,
        );
        if ok.is_err() || written != payload.len() as u32 {
            let _ = EndPagePrinter(h_printer);
            let _ = EndDocPrinter(h_printer);
            let _ = ClosePrinter(h_printer);
            return Err(format!(
                "WritePrinter({printer_name}): wrote {written} of {} bytes",
                payload.len()
            ));
        }

        let _ = EndPagePrinter(h_printer);
        let _ = EndDocPrinter(h_printer);
        let _ = ClosePrinter(h_printer);
        Ok(())
    }
}
