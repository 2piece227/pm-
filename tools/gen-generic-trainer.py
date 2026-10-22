"""
범용 트레이너 도트 — public/assets/trainers/generic.png (80×80, 원작 트레이너 스프라이트와 같은 판형)

네임드가 아닌 트레이너(생성 유스·NPC 소속사 선수·생성 사천왕/챔피언)는 FM의 기본 얼굴처럼
이 한 장을 같이 쓴다. 외부 의존성 없이 순수 파이썬으로 PNG를 쓴다.
실행: python tools/gen-generic-trainer.py
"""
import os, struct, zlib

W = H = 80
px = [[None] * W for _ in range(H)]

def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
C = {k: hexc(v) for k, v in {
    'cap': '#3e9c8b', 'capHi': '#6cd3bf', 'brim': '#2b6f63', 'hair': '#4a3428',
    'skin': '#f3c9a3', 'skinSh': '#d9a47e', 'eye': '#1d1f2a', 'mouth': '#b0675a',
    'jacket': '#2f3a5c', 'jacketHi': '#47577f', 'zip': '#c9d2e6', 'shirt': '#e9edf3',
    'strap': '#d4a94a', 'bag': '#c0862f', 'pants': '#3d4250', 'pantsHi': '#555b6c',
    'shoe': '#c94a4a', 'sole': '#eeeeee', 'glove': '#e9edf3',
}.items()}
OUT = hexc('#161923')

def put(x, y, c):
    if 0 <= x < W and 0 <= y < H: px[y][x] = c
def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): put(x, y, c)
def ellipse(cx, cy, rx, ry, c, y_min=-1, y_max=999):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x - cx) / (rx + .5)) ** 2 + ((y - cy) / (ry + .5)) ** 2 <= 1 and y_min <= y <= y_max: put(x, y, c)
def trap(y0, y1, l0, r0, l1, r1, c):
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        rect(round(l0 + (l1 - l0) * t), y, round(r0 + (r1 - r0) * t), y, c)

cx = 40
# 다리·신발
rect(31, 56, 38, 70, C['pants']); rect(42, 56, 49, 70, C['pants'])
rect(32, 57, 33, 69, C['pantsHi']); rect(43, 57, 44, 69, C['pantsHi'])
rect(29, 71, 38, 74, C['shoe']); rect(42, 71, 51, 74, C['shoe'])
rect(29, 75, 38, 75, C['sole']); rect(42, 75, 51, 75, C['sole'])
# 몸통(재킷)
trap(33, 55, 28, 52, 30, 50, C['jacket'])
trap(34, 54, 29, 32, 31, 33, C['jacketHi'])
rect(39, 35, 41, 55, C['shirt']); rect(40, 36, 40, 55, C['zip'])
# 가방끈·가방
for i in range(22):
    put(31 + i, 34 + i, C['strap']); put(32 + i, 34 + i, C['strap'])
rect(47, 50, 54, 57, C['bag'])
# 팔·장갑
trap(34, 50, 23, 27, 21, 26, C['jacket']); trap(34, 50, 53, 57, 54, 59, C['jacket'])
rect(21, 51, 26, 55, C['glove']); rect(54, 51, 59, 55, C['glove'])
# 목·얼굴
rect(37, 30, 43, 33, C['skinSh'])
ellipse(cx, 23, 8, 8, C['skin'])
for y in range(16, 31): put(cx + 7, y, C['skinSh']) if px[y][cx + 7] == C['skin'] else None
# 머리카락(모자 아래 옆머리)
rect(31, 15, 33, 24, C['hair']); rect(47, 15, 49, 24, C['hair'])
# 모자
ellipse(cx, 15, 10, 8, C['cap'], y_max=16)
ellipse(cx - 3, 11, 4, 2, C['capHi'], y_max=13)
rect(30, 16, 52, 18, C['brim']); rect(48, 17, 54, 18, C['brim'])
rect(34, 9, 38, 9, C['capHi'])
# 눈·입
rect(36, 22, 37, 24, C['eye']); rect(43, 22, 44, 24, C['eye'])
put(36, 22, C['sole']); put(43, 22, C['sole'])
rect(39, 28, 41, 28, C['mouth'])

# 외곽선: 채워진 칸에 닿은 빈 칸
filled = [[c is not None for c in row] for row in px]
for y in range(H):
    for x in range(W):
        if filled[y][x]: continue
        if any(0 <= x + dx < W and 0 <= y + dy < H and filled[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[y][x] = OUT
# 오른쪽 그늘 (원작 스프라이트처럼 빛은 왼쪽 위)
for y in range(H):
    for x in range(cx + 3, W):
        c = px[y][x]
        if c and c != OUT and c not in (C['eye'], C['sole']):
            px[y][x] = tuple(int(v * .86) for v in c[:3]) + (255,)

raw = b''.join(b'\x00' + b''.join(bytes(c if c else (0, 0, 0, 0)) for c in row) for row in px)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'trainers', 'generic.png')
open(out, 'wb').write(png)
print('wrote', os.path.normpath(out), len(png), 'bytes')
