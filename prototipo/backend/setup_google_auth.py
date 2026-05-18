"""
Script de configuração do Google OAuth.
Execute uma vez antes de iniciar o servidor: python setup_google_auth.py
"""
import sys
from pathlib import Path

def main():
    print("\n=== HostMaster AI — Configuração Google OAuth ===\n")

    # Verifica se .env existe
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        print("[ERRO] Arquivo .env não encontrado.")
        print("       Copie .env.example para .env e preencha os campos.\n")
        sys.exit(1)

    # Carrega configurações
    from config import settings
    creds_path = Path(settings.google_credentials_file)

    if not creds_path.exists():
        print("[ERRO] Arquivo de credenciais OAuth não encontrado.")
        print(f"       Caminho esperado: {creds_path}\n")
        print("  Passos para obter as credenciais:")
        print("  1. Acesse: https://console.cloud.google.com/")
        print("  2. Crie um projeto (ou selecione um existente)")
        print("  3. Menu lateral > APIs e Serviços > Biblioteca")
        print("     - Ative: Gmail API")
        print("     - Ative: Google Sheets API")
        print("     - Ative: Google Drive API")
        print("  4. Menu lateral > APIs e Serviços > Credenciais")
        print("  5. Clique em '+ Criar credenciais' > 'ID do cliente OAuth'")
        print("  6. Tipo de aplicativo: 'App para computador'")
        print("  7. Faça o download do JSON")
        print(f"  8. Salve o arquivo em: {creds_path}\n")
        sys.exit(1)

    print(f"[OK] Credenciais encontradas: {creds_path}")
    print("[...] Abrindo navegador para autorização...\n")

    try:
        from utils.google_auth import get_credentials
        creds = get_credentials()
        token_path = Path(settings.google_token_file)
        print(f"[OK] Token salvo em: {token_path}")
        print("\nConfiguração concluída! Você pode iniciar o servidor agora.\n")
    except Exception as e:
        print(f"[ERRO] Falha na autenticação: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
