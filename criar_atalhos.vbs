Set oWS = WScript.CreateObject("WScript.Shell")
sDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sDesktop = oWS.SpecialFolders("Desktop")

' Atalho: Iniciar HostMaster AI
Set oLink = oWS.CreateShortcut(sDesktop & "\Iniciar HostMaster AI.lnk")
oLink.TargetPath = sDir & "iniciar.bat"
oLink.WorkingDirectory = sDir
oLink.Description = "Iniciar HostMaster AI (backend + dashboard)"
oLink.WindowStyle = 1
oLink.Save

' Atalho: Abrir Dashboard
Set oLink2 = oWS.CreateShortcut(sDesktop & "\Dashboard HostMaster.lnk")
oLink2.TargetPath = oWS.ExpandEnvironmentStrings("%SystemRoot%\System32\cmd.exe")
oLink2.Arguments = "/c start http://localhost:3000"
oLink2.WorkingDirectory = sDir
oLink2.Description = "Abrir dashboard HostMaster no navegador"
oLink2.WindowStyle = 7
oLink2.Save

MsgBox "Atalhos criados na area de trabalho:" & vbNewLine & vbNewLine & _
       "- Iniciar HostMaster AI" & vbNewLine & _
       "- Dashboard HostMaster" & vbNewLine & vbNewLine & _
       "Execute 'Iniciar HostMaster AI' para ligar o bot.", _
       64, "HostMaster AI"
