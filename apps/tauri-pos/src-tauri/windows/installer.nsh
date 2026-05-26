!macro NSIS_HOOK_POSTINSTALL
  ; VC++ 2015–2022 x64 runtime (bundled via bundle.resources → binaries/VC_redist.x64.exe)
  ReadRegDWord $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 == 1
    DetailPrint "Visual C++ Redistributable already installed"
    Goto vcredist_done
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\binaries\VC_redist.x64.exe"
    DetailPrint "Installing Visual C++ Redistributable..."
    CopyFiles "$INSTDIR\binaries\VC_redist.x64.exe" "$TEMP\VC_redist.x64.exe"
    ExecWait '"$TEMP\VC_redist.x64.exe" /quiet /norestart' $0
    Delete "$TEMP\VC_redist.x64.exe"
    Delete "$INSTDIR\binaries\VC_redist.x64.exe"
  ${EndIf}

  vcredist_done:
!macroend
