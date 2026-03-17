with open('.github/workflows/daily-it-news.yml', 'r') as f:
    text = f.read()

# Fix the PROMPT
old_prompt = 'PROMPT_TEXT="You are a sarcastic British IT support columnist. Given the news summary \\'$ARTICLE_SUMMARY\\', craft a witty British-leaning recap that highlights the epic IT fail and includes at least one pun. Respond ONLY with JSON matching: {\\"summary\\": \\"<2-3 sentence summary>\\", \\"hashtags\\": [\\"#tag1\\", \\"#tag2\\", \\"#tag3\\"] }."'
new_prompt = 'PROMPT_TEXT="You are a deeply cynical, witty British IT professional (like BOFH). Read this news summary: \\'$ARTICLE_SUMMARY\\'. Write a highly sarcastic 2-3 sentence recap mocking the utter incompetence, poor decisions, or epic IT fail involved, using heavy British slang and at least one terrible pun. You MUST output ONLY valid JSON matching exactly this format: {\\"summary\\": \\"<your cynical text>\\", \\"hashtags\\": [\\"#tag1\\", \\"#tag2\\", \\"#tag3\\"]}. Do not include any markdown formatting, backticks, or new_prompt = 'PROMPT_TEX

text = text.replace(old_prompt, new_prompt)

# Fix the JSON # Fix the JSON # F= "# Fix the echo \"# Fix the JSON # Fix the JSON # F= "# Fix the echo \"# Fix the JSON # Fix the JSON # F= "# Fix the echo \"# Fix the JSON # Fix the JSON # F= "# Fix the echo \"# Fix the JSON # Fix the JSON # F= "# Fix the echo \"# Fix the JSON # Fix the JSON # F= "# Fix the echo \"# Fix the JSON # Fix the JSON # F= "# Fix the echo \"# Fix the JSON # Fix the JSON # F= "# Fix th          -H "Authorization: Bearer ${{ secrets.CF_AI_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d "{\\"prompt\\":\\"British comic strip of an exasperated IT support engineer dealing with an epic outage: $CURRENT_SUMMARY\\"}")'''
new_img = '''          SAFE_PROMPT=$(jq -n --arg msg "A funny British comic book cartoon showing a frustrated IT support engineer in a server room dealing with an epic fail: $CURRENT_SUMMARY" '{"prompt": $msg}')
          RESPONSE=$(curl -s -X POST "$CF_URL" \\
            -H "Authorization: Bearer             -H "Authorization: Bearer      -H "Content-Type: application/json" \\
            -d "$SAFE_PROMPT")'''

text = text.replace(old_img, new_img)

text = text.replace('IMAGE_DATA="data:image/png;base64,$IMAGE_BASE64"', 'IMAGE_DATA="data:image/jpeg;base64,$IMAGE_BASE64"')

with open('.github/workflows/daily-it-news.yml', 'w') as f:
    f.write(text)
