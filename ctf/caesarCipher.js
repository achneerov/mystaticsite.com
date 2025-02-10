// caesarCipher.js
export function decodeCaesar(input, alphabetStr) {
    const results = [];
    const alphabet = alphabetStr.split(',').map(c => c.trim().toUpperCase());
    
    // Try all 26 possible shifts
    for (let shift = 0; shift < 26; shift++) {
        let decoded = '';
        for (let i = 0; i < input.length; i++) {
            const char = input[i].toUpperCase();
            if (alphabet.includes(char)) {
                const currentIndex = alphabet.indexOf(char);
                const newIndex = (currentIndex - shift + 26) % 26;
                decoded += input[i] === char ? alphabet[newIndex] : alphabet[newIndex].toLowerCase();
            } else {
                decoded += input[i];
            }
        }
        results.push([
            `Caesar Cipher - Shift ${shift} - Using alphabet: ${alphabetStr}`,
            decoded
        ]);
    }
    return results;
}