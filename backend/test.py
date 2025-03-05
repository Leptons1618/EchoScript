# import torch

# def print_gpu_info():
#     print("Torch version:", torch.__version__)
#     print("CUDA available:", torch.cuda.is_available())
    
#     if torch.cuda.is_available():
#         print("GPU Device Name:", torch.cuda.get_device_name())
#         print("GPU Device Count:", torch.cuda.device_count())
#         print("Current GPU Device Index:", torch.cuda.current_device())
#         print("Memory Allocated:", torch.cuda.memory_allocated())
#         print("Memory Reserved:", torch.cuda.memory_reserved())
#         print("Memory Summary:\n", torch.cuda.memory_summary())
#         # print("Memory Snapshot:\n", torch.cuda.memory_snapshot())
#         # print("Memory Stats:\n", torch.cuda.memory_stats())
#     else:
#         print("CUDA is not available. No GPU information can be retrieved.")

# if __name__ == "__main__":
#     print_gpu_info()


from faster_whisper import WhisperModel
import time

model_size = "large-v3"

# Run on GPU with FP16
# model = WhisperModel(model_size, device="cuda", compute_type="float16")

# Let's calculate the time it takes to load the model
start = time.time()
# or run on GPU with INT8
print(f'Loading model {model_size}...')
model = WhisperModel(model_size, device="cuda", compute_type="int8_float16")
print(f'Model {model_size} loaded.')
end = time.time()
print(f"Model loading time: {end - start} seconds")
# or run on CPU with INT8
# model = WhisperModel(model_size, device="cpu", compute_type="int8")

segments, info = model.transcribe("audio.mp3", beam_size=5)

print("Detected language '%s' with probability %f" % (info.language, info.language_probability))

for segment in segments:
    print("[%.2fs -> %.2fs] %s" % (segment.start, segment.end, segment.text))