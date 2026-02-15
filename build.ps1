$time = Measure-Command {
    & nuitka `
        --mingw64 `
        --standalone `
        --jobs=16 `
        --assume-yes-for-downloads `
        --output-dir=build `
        --show-progress `
        --windows-console-mode=disable `
        --file-version=0.0.0.0 `
        --windows-file-description="DO NOT REDISTRIBUTE" `
        server.py
}

Write-Host "Nuitka 编译完成，耗时: $($time.TotalMinutes.ToString('F1')) 分钟 ($($time.TotalSeconds.ToString('F0')) 秒)"