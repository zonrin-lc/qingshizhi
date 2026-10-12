#!/usr/bin/env python3
"""给配音片段前置一小段静音,规避播放器起播时削掉首字。

幂等:仅对「前导静音 < 100ms」的片段补白,重复运行不会叠加。
用法:python3 prot/pad-voice-audio.py [--pad 0.12] [--dir assets/audio/voice]
"""
import argparse, math, os, struct, subprocess, sys, tempfile

def leading_silence_ms(path, thresh_db=-45.0, win_ms=10, probe_s=0.3):
    """返回首个超过阈值的 10ms 窗口的起点(ms);全静音返回 probe_s。只解码前 probe_s 秒。"""
    dur = probe_s
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-t", str(probe_s), "-i", path,
         "-f", "s16le", "-ac", "1", "-ar", "44100", "-"],
        capture_output=True).stdout
    n = len(pcm) // 2
    if n == 0:
        return dur * 1000
    samples = struct.unpack("<%dh" % n, pcm[:n * 2])
    step = int(44100 * win_ms / 1000)
    thresh = 32768 * (10 ** (thresh_db / 20))
    for i in range(0, n, step):
        chunk = samples[i:i + step]
        if not chunk:
            break
        rms = math.sqrt(sum(s * s for s in chunk) / len(chunk))
        if rms >= thresh:
            return i / 44100 * 1000
    return dur * 1000

def pad(path, pad_s):
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(suffix=".ogg", dir=d)
    os.close(fd)
    try:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y",
             "-f", "lavfi", "-t", "%.4f" % pad_s, "-i", "anullsrc=r=44100:cl=mono",
             "-i", path,
             "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1",
             "-c:a", "libvorbis", "-q:a", "5", tmp],
            check=True)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pad", type=float, default=0.12, help="前置静音秒数")
    ap.add_argument("--dir", default="assets/audio/voice")
    ap.add_argument("--threshold-ms", type=float, default=100.0, help="已有前导静音超过此值则跳过")
    args = ap.parse_args()

    files = sorted(f for f in os.listdir(args.dir) if f.endswith(".ogg"))

    def handle(f):
        p = os.path.join(args.dir, f)
        lead = leading_silence_ms(p)
        if lead >= args.threshold_ms:
            return 0
        pad(p, args.pad)
        return 1

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(handle, files))
    padded = sum(results)
    skipped = len(files) - padded
    print("[pad-voice] padded=%d skipped=%d total=%d" % (padded, skipped, len(files)))

if __name__ == "__main__":
    main()
