!macro NSIS_HOOK_PREINSTALL

SetOutPath "$INSTDIR"

File "binaries\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
ExecWait '"$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe" /silent /install'

File "binaries\VC_redist.x64.exe"
ExecWait '"$INSTDIR\VC_redist.x64.exe" /quiet /norestart'

!macroend