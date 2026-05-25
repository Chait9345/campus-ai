import google.generativeai as genai

print("STARTING TEST...")

genai.configure(api_key="AIzaSyDQtiiJ1Vunf8fvSGLQ5dsyeZlqDq37qxI")

try:
    models = genai.list_models()
    print("MODELS FOUND:\n")

    for m in models:
        print(m.name, "->", m.supported_generation_methods)

except Exception as e:
    print("ERROR:", str(e))