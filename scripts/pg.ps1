# تشغيل PostgreSQL المحلي (نسخة محمولة بلا مُثبِّت ولا صلاحيات مدير).
#
#   .\scripts\pg.ps1 start    تشغيل الخادم
#   .\scripts\pg.ps1 stop     إيقافه
#   .\scripts\pg.ps1 status   حالته
#
# مُثبِّت EnterpriseDB الرسمي كان يرجع 403 عبر winget، فاستُعملت حزمة البرامج
# الثنائية بدلًا منه. مسار البيانات خارج مجلد Dropbox عمدًا: مزامنة ملفات
# قاعدة بيانات حيّة تُفسدها.

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'psql')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$Bin  = 'C:\pgsql17\pgsql\bin'
$Data = 'C:\pgsql17\data'
$Log  = 'C:\pgsql17\server.log'
$Db   = 'bader_aid'

if (-not (Test-Path $Bin)) {
  Write-Error "PostgreSQL غير موجود في $Bin"
  exit 1
}

switch ($Action) {
  'start' {
    & "$Bin\pg_ctl.exe" -D $Data -l $Log -o '-p 5432' start
    Start-Sleep -Seconds 2
    & "$Bin\pg_isready.exe" -h 127.0.0.1 -p 5432
  }
  'stop' {
    & "$Bin\pg_ctl.exe" -D $Data -m fast stop
  }
  'status' {
    & "$Bin\pg_isready.exe" -h 127.0.0.1 -p 5432
  }
  'psql' {
    $env:PGPASSWORD = 'baderdev2026'
    & "$Bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d $Db
  }
}
