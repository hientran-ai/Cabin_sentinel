# Vendored detector (served from this server, no CDN)

- `tf.min.js`: TensorFlow.js 4.22.0 (Apache-2.0), from cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js.
  Patched in two places: `Function("return this")()` and `Function("r","regeneratorRuntime = r")(t)` became `globalThis`
  statements. Both ran `eval` at load time, which our Content-Security-Policy (no `unsafe-eval`) blocks, and the library then
  stayed empty ("loadGraphModel is not a function").
- `coco-ssd.min.js`: @tensorflow-models/coco-ssd 2.2.3 (Apache-2.0).
- `coco-ssd/`: the `lite_mobilenet_v2` weights from storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2 (Apache-2.0).
