
import os
from dotenv import load_dotenv
from openai import OpenAI

# Carga la API Key desde .env
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Ejemplo
prompt = "Agrega un atributo llamado 'direccion' de tipo String a la clase Persona."


response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "Eres un asistente experto en ingeniería de software."},
        {"role": "user", "content": prompt}
    ],
    max_tokens=60,    
    temperature=0.3    #creatividad
)

print("Respuesta:\n", response.choices[0].message.content)


