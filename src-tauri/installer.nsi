; GrabZilla 2.0 - NSIS Installer Script
; This installer provides secure installation with proper UAC handling

!define APPNAME "GrabZilla 2.0"
!define COMPANYNAME "GrabZilla Team"
!define DESCRIPTION "Professional video downloader and transcoding tool"
!define VERSIONMAJOR 2
!define VERSIONMINOR 0
!define VERSIONBUILD 0
!define HELPURL "https://grabzilla.com/help"
!define UPDATEURL "https://grabzilla.com/updates"
!define ABOUTURL "https://grabzilla.com/about"
!define INSTALLSIZE 150000 ; Size in KB

RequestExecutionLevel user ; Request user-level privileges only

; Modern UI
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"

; Installer attributes
Name "${APPNAME}"
OutFile "${APPNAME} Setup.exe"
InstallDir "$LOCALAPPDATA\${APPNAME}"
InstallDirRegKey HKCU "Software\${COMPANYNAME}\${APPNAME}" "InstallLocation"

; Version information
VIProductVersion "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "${COMPANYNAME}"
VIAddVersionKey "LegalCopyright" "© 2024 ${COMPANYNAME}. All rights reserved."
VIAddVersionKey "FileDescription" "${DESCRIPTION}"
VIAddVersionKey "FileVersion" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}.0"

; Interface Configuration
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_ABORTWARNING
!define MUI_ICON "icons\icon.ico"
!define MUI_UNICON "icons\icon.ico"

; Pages
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Security functions
Function CheckAdminRights
    UserInfo::GetAccountType
    Pop $0
    ${If} $0 == "Admin"
        MessageBox MB_YESNO|MB_ICONQUESTION "Administrator privileges detected. For security reasons, ${APPNAME} is designed to run with standard user privileges.$\n$\nContinue installation? (Recommended: No)" IDYES admin_continue
        Abort
        admin_continue:
        DetailPrint "Warning: Installing with administrator privileges"
    ${EndIf}
FunctionEnd

Function CheckExistingInstallation
    ; Check if already installed
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString"
    ${If} $0 != ""
        MessageBox MB_YESNO|MB_ICONQUESTION "${APPNAME} is already installed. Would you like to uninstall the previous version first?" IDNO existing_skip
        ExecWait "$0 /S"
        existing_skip:
    ${EndIf}
FunctionEnd

Function ValidateInstallDirectory
    ; Ensure install directory is writable
    ClearErrors
    CreateDirectory "$INSTDIR\test"
    IfErrors 0 dir_ok
        MessageBox MB_OK|MB_ICONSTOP "Cannot write to installation directory: $INSTDIR$\n$\nPlease choose a different location."
        Abort
    dir_ok:
    RMDir "$INSTDIR\test"
FunctionEnd

; Installer sections
Section "Core Application" SecCore
    SectionIn RO ; Required section
    
    Call CheckAdminRights
    Call CheckExistingInstallation
    Call ValidateInstallDirectory
    
    SetOutPath "$INSTDIR"
    
    ; Main executable
    File "${APPNAME}.exe"
    
    ; Dependencies
    File /r "deps\*"
    
    ; Configuration files
    File "tauri.conf.json"
    
    ; License and documentation
    File "LICENSE"
    File "README.md"
    
    ; Create uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    
    ; Registry entries for Add/Remove Programs
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" "$INSTDIR\${APPNAME}.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${COMPANYNAME}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "HelpLink" "${HELPURL}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "URLUpdateInfo" "${UPDATEURL}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "URLInfoAbout" "${ABOUTURL}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "VersionMajor" ${VERSIONMAJOR}
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "VersionMinor" ${VERSIONMINOR}
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "NoRepair" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "EstimatedSize" ${INSTALLSIZE}
    
    ; Application settings
    WriteRegStr HKCU "Software\${COMPANYNAME}\${APPNAME}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\${COMPANYNAME}\${APPNAME}" "Version" "${VERSIONMAJOR}.${VERSIONMINOR}.${VERSIONBUILD}"
    
SectionEnd

Section "Desktop Shortcut" SecDesktop
    CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\${APPNAME}.exe" 0
SectionEnd

Section "Start Menu Shortcut" SecStartMenu
    CreateDirectory "$SMPROGRAMS\${COMPANYNAME}"
    CreateShortCut "$SMPROGRAMS\${COMPANYNAME}\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\${APPNAME}.exe" 0
    CreateShortCut "$SMPROGRAMS\${COMPANYNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
SectionEnd

Section "File Associations" SecFileAssoc
    ; Register video file associations (optional)
    WriteRegStr HKCU "Software\Classes\.mp4\OpenWithProgids" "${APPNAME}.mp4" ""
    WriteRegStr HKCU "Software\Classes\.mkv\OpenWithProgids" "${APPNAME}.mkv" ""
    WriteRegStr HKCU "Software\Classes\.webm\OpenWithProgids" "${APPNAME}.webm" ""
    
    WriteRegStr HKCU "Software\Classes\${APPNAME}.mp4" "" "${APPNAME} Video File"
    WriteRegStr HKCU "Software\Classes\${APPNAME}.mp4\DefaultIcon" "" "$INSTDIR\${APPNAME}.exe,0"
    WriteRegStr HKCU "Software\Classes\${APPNAME}.mp4\shell\open\command" "" '"$INSTDIR\${APPNAME}.exe" "%1"'
SectionEnd

Section "URL Protocol Handler" SecUrlProtocol
    ; Register grabzilla:// protocol handler
    WriteRegStr HKCU "Software\Classes\grabzilla" "" "GrabZilla URL Protocol"
    WriteRegStr HKCU "Software\Classes\grabzilla" "URL Protocol" ""
    WriteRegStr HKCU "Software\Classes\grabzilla\DefaultIcon" "" "$INSTDIR\${APPNAME}.exe,0"
    WriteRegStr HKCU "Software\Classes\grabzilla\shell\open\command" "" '"$INSTDIR\${APPNAME}.exe" "url=%1"'
SectionEnd

; Descriptions
LangString DESC_SecCore ${LANG_ENGLISH} "Core application files (required)"
LangString DESC_SecDesktop ${LANG_ENGLISH} "Create a desktop shortcut"
LangString DESC_SecStartMenu ${LANG_ENGLISH} "Create start menu shortcuts"
LangString DESC_SecFileAssoc ${LANG_ENGLISH} "Associate video files with ${APPNAME}"
LangString DESC_SecUrlProtocol ${LANG_ENGLISH} "Register grabzilla:// URL protocol handler"

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
    !insertmacro MUI_DESCRIPTION_TEXT ${SecCore} $(DESC_SecCore)
    !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_SecDesktop)
    !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} $(DESC_SecStartMenu)
    !insertmacro MUI_DESCRIPTION_TEXT ${SecFileAssoc} $(DESC_SecFileAssoc)
    !insertmacro MUI_DESCRIPTION_TEXT ${SecUrlProtocol} $(DESC_SecUrlProtocol)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; Security validation on install
Function .onInit
    ; Check Windows version
    ${If} ${AtLeastWin7}
        DetailPrint "Windows version check: OK"
    ${Else}
        MessageBox MB_OK|MB_ICONSTOP "${APPNAME} requires Windows 7 or later."
        Abort
    ${EndIf}
    
    ; Check architecture
    ${If} ${RunningX64}
        DetailPrint "Architecture check: x64"
    ${Else}
        MessageBox MB_OK|MB_ICONSTOP "${APPNAME} requires a 64-bit Windows system."
        Abort
    ${EndIf}
    
    ; Check available disk space
    ${GetRoot} "$INSTDIR" $0
    ${DriveSpace} "$0" "/D=F /S=K" $1
    ${If} $1 < ${INSTALLSIZE}
        MessageBox MB_OK|MB_ICONSTOP "Insufficient disk space. ${APPNAME} requires ${INSTALLSIZE} KB of free space."
        Abort
    ${EndIf}
FunctionEnd

; Uninstaller
Section "Uninstall"
    ; Remove application files
    Delete "$INSTDIR\${APPNAME}.exe"
    Delete "$INSTDIR\Uninstall.exe"
    Delete "$INSTDIR\LICENSE"
    Delete "$INSTDIR\README.md"
    Delete "$INSTDIR\tauri.conf.json"
    
    ; Remove dependencies
    RMDir /r "$INSTDIR\deps"
    
    ; Remove shortcuts
    Delete "$DESKTOP\${APPNAME}.lnk"
    Delete "$SMPROGRAMS\${COMPANYNAME}\${APPNAME}.lnk"
    Delete "$SMPROGRAMS\${COMPANYNAME}\Uninstall ${APPNAME}.lnk"
    RMDir "$SMPROGRAMS\${COMPANYNAME}"
    
    ; Remove registry entries
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
    DeleteRegKey HKCU "Software\${COMPANYNAME}\${APPNAME}"
    DeleteRegKey HKCU "Software\${COMPANYNAME}"
    
    ; Remove file associations
    DeleteRegKey HKCU "Software\Classes\${APPNAME}.mp4"
    DeleteRegKey HKCU "Software\Classes\${APPNAME}.mkv"
    DeleteRegKey HKCU "Software\Classes\${APPNAME}.webm"
    DeleteRegValue HKCU "Software\Classes\.mp4\OpenWithProgids" "${APPNAME}.mp4"
    DeleteRegValue HKCU "Software\Classes\.mkv\OpenWithProgids" "${APPNAME}.mkv"
    DeleteRegValue HKCU "Software\Classes\.webm\OpenWithProgids" "${APPNAME}.webm"
    
    ; Remove URL protocol
    DeleteRegKey HKCU "Software\Classes\grabzilla"
    
    ; Remove installation directory
    RMDir "$INSTDIR"
    
    ; Clean user data (optional)
    MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to remove user data and settings?" IDNO skip_userdata
    RMDir /r "$APPDATA\${APPNAME}"
    RMDir /r "$LOCALAPPDATA\${APPNAME}"
    skip_userdata:
    
SectionEnd

; Security callback for uninstaller
Function un.onInit
    MessageBox MB_YESNO|MB_ICONQUESTION "Are you sure you want to uninstall ${APPNAME}?" IDYES uninst_continue
    Abort
    uninst_continue:
FunctionEnd

; Custom functions for security
Function CheckWritePermissions
    ; Test write permissions to install directory
    ClearErrors
    FileOpen $0 "$INSTDIR\write_test.tmp" w
    IfErrors no_write
    FileClose $0
    Delete "$INSTDIR\write_test.tmp"
    Return
    
    no_write:
    MessageBox MB_OK|MB_ICONSTOP "No write permission to $INSTDIR. Please choose a different directory."
    Abort
FunctionEnd

Function ValidateExecutable
    ; Basic validation of the main executable
    IfFileExists "$INSTDIR\${APPNAME}.exe" file_exists
    MessageBox MB_OK|MB_ICONSTOP "Installation failed: Main executable not found."
    Abort
    
    file_exists:
    ; Check file size (basic integrity check)
    ${GetSize} "$INSTDIR\${APPNAME}.exe" "/S=B" $0 $1 $2
    ${If} $0 < 1048576  ; Less than 1MB
        MessageBox MB_OK|MB_ICONSTOP "Installation failed: Main executable appears corrupted."
        Abort
    ${EndIf}
FunctionEnd

; Post-installation validation
Function .onInstSuccess
    Call ValidateExecutable
    MessageBox MB_YESNO|MB_ICONQUESTION "Installation completed successfully!$\n$\nWould you like to run ${APPNAME} now?" IDNO run_skip
    Exec "$INSTDIR\${APPNAME}.exe"
    run_skip:
FunctionEnd

; Installation failure cleanup
Function .onInstFailed
    MessageBox MB_OK|MB_ICONSTOP "Installation failed. Cleaning up..."
    RMDir /r "$INSTDIR"
FunctionEnd