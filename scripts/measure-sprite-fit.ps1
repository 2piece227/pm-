# src/data/sprite-fit.js 재생성 스크립트.
#
# teams.js에 있는 모든 종의 앞/뒷모습 스프라이트를 내려받아 알파 채널 바운딩박스를
# 측정하고, 캔버스 채움 비율이 낮은(작게 그려지는) 종에 보정 배율을 계산해
# src/data/sprite-fit.js를 다시 쓴다. 새 포켓몬을 로스터에 추가했을 때 실행할 것.
#
# 실행: powershell -File scripts/measure-sprite-fit.ps1
# (프로젝트 루트에서 실행. Node + 인터넷 연결 필요 — play.pokemonshowdown.com에서 받아온다.)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$TARGET = 72   # 목표 채움 비율(%). 너무 높이면 상한(MAX)에 걸리는 종이 늘어난다.
$MIN = 1.0
$MAX = 1.6     # 배틀 화면 위쪽 여백(§CSS .spr.me 기준)이 감당하는 안전 상한.

# 1) 로스터 뽑기 (teams.js의 모든 프리셋에서 종명 파싱)
$species = node -e @"
import('./src/data/teams.js').then(({TEAM_PRESETS}) => {
  const names = new Set();
  for (const key of Object.keys(TEAM_PRESETS)) {
    for (const side of ['A','B']) {
      const text = TEAM_PRESETS[key][side];
      for (const block of text.split(/\n\n/)) {
        const first = block.trim().split('\n')[0];
        if (!first) continue;
        names.add(first.split(' @')[0].trim());
      }
    }
  }
  console.log([...names].join('\n'));
});
"@
$species = $species -split "`n" | Where-Object { $_ -ne '' }
Write-Host "로스터: $($species -join ', ')"

# 2) 종별 실제 해상 URL 얻기 (@pkmn/img — gen4 우선, 없으면 자동 상위 세대)
$urlsJson = node -e @"
import('@pkmn/img').then(({Sprites}) => {
  const names = ``$(($species | ForEach-Object { "'$_'" }) -join ',')``.split(',').map(s=>s.slice(1,-1));
  const out = {};
  for (const n of names) {
    out[n] = {
      back: Sprites.getPokemon(n, {gen:'gen4', side:'p1'}).url,
      front: Sprites.getPokemon(n, {gen:'gen4', side:'p2'}).url,
    };
  }
  console.log(JSON.stringify(out));
});
"@
$urls = $urlsJson | ConvertFrom-Json

# 3) 다운로드 + 알파 바운딩박스 측정
Add-Type -AssemblyName System.Drawing
$tmp = Join-Path $env:TEMP "sprite-fit-measure"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$wc = New-Object System.Net.WebClient

function Get-FillPct($path) {
  $bmp = [System.Drawing.Bitmap]::FromFile($path)
  $w = $bmp.Width; $h = $bmp.Height
  $minY = $h; $maxY = -1
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      if ($bmp.GetPixel($x, $y).A -gt 10) {
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
        break
      }
    }
  }
  $bmp.Dispose()
  if ($maxY -lt 0) { return 100 }
  return (($maxY - $minY + 1) / $h) * 100
}

$table = @{}
foreach ($name in $urls.PSObject.Properties.Name) {
  $entry = $urls.$name
  $table[$name] = @{}
  foreach ($orient in @('back', 'front')) {
    $path = Join-Path $tmp "$($name)_$orient.png"
    $wc.DownloadFile($entry.$orient, $path)
    $fill = Get-FillPct $path
    $scale = [math]::Round([math]::Min($MAX, [math]::Max($MIN, $TARGET / $fill)), 2)
    $table[$name][$orient] = $scale
    Write-Host ("{0,-20} {1,-6} fill={2,6:N1}%  scale={3}" -f $name, $orient, $fill, $scale)
  }
}

# 4) src/data/sprite-fit.js 다시 쓰기
$lines = $table.Keys | Sort-Object | ForEach-Object {
  "  '$_': { back: $($table[$_].back), front: $($table[$_].front) },"
}
$body = $lines -join "`n"

$header = @'
/**
 * 스프라이트 "채움 비율" 보정표. — 표시 전용, 로직에는 영향 없음.
 * scripts/measure-sprite-fit.ps1로 자동 생성됨. 손으로 고치지 말고 스크립트를 다시 돌릴 것.
 *
 * 문제: 쇼다운 정적 스프라이트는 96x96 고정 캔버스 안에 그려지는데,
 * 캐릭터가 그 캔버스를 얼마나 채우는지는 종마다 완전히 다르다 (해피너스 42% vs 리자몽 81%).
 * 발 위치(캔버스 하단) 기준으로 확대해서 채움 비율을 목표치에 맞춘다.
 */
export const SPRITE_FIT = {
'@

$footer = @'
};

/** 표에 없는 종은 1(무보정)로 떨어진다. */
export function spriteFitScale(species, orient) {
  const entry = SPRITE_FIT[species];
  return (entry && entry[orient]) || 1;
}
'@

$out = $header + "`n" + $body + "`n" + $footer + "`n"
# Windows PowerShell 5.1엔 -Encoding utf8NoBOM이 없다 (7+ 전용) — .NET으로 직접 BOM 없이 쓴다.
$fullPath = Join-Path (Get-Location) "src/data/sprite-fit.js"
[System.IO.File]::WriteAllText($fullPath, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "`nsrc/data/sprite-fit.js 갱신 완료."
