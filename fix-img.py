with open('.github/workflows/daily-it-news.yml', 'r') as f:
    text = f.read()

# Fix Image generation payload
old_img = """          CF_URL="https://api.cloudflare.com/client/v4/accounts/${{ secrets.CF_AI_ACCOUNT_ID }}/ai/run/@cf/bytedance/stable-diffusion-xl-lightning"
          RESPONSE=$(curl -s -X POST "$CF_URL" \\
            -H "Authorization: Bearer ${{ secrets.CF_AI_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d "{\\"prompt\\":\\"British comic strip of an exasperated IT support engineer dealing with an epic outage: $CURRENT_SUMMARY\\"}")"""

new_img = """          SAFE_PROMPT=$(jq -n --arg msg "A funny British comic book cartoon showing a frustrated IT support engineer in a server room dealing with an epic fail: $CURRENT_SUMMARY" '{"prompt": $msg}')
          CF_URL="https://api.cloudflare.com/client/v4/accounts/${{ secrets.CF_AI_ACCOUNT_ID }}/ai/run/@cf/bytedance/stable-diffusion-xl-lightning"
          RESPONSE=$(curl -s -X POST "$CF_URL" \\          RESPONSE=$(cuization: Bearer ${{ secrets.CF_AI_TOKEN }}" \\
            -H "Content-Type: applic            -H "Content-Type: "$SAFE_PROMPT")"""

text = text.replace(old_img, new_img)

with open('.github/workflows/daily-it-news.yml', 'w') as f:
    f.write(text)
