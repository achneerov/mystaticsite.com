// atbashCipher.js
export function decodeAtbash(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const reversed = alphabet.split('').reverse().join('');
    
    let decoded = '';
    for (let i = 0; i < input.length; i++) {
        const char = input[i].toUpperCase();
        if (alphabet.includes(char)) {
            const index = alphabet.indexOf(char);
            decoded += input[i] === char ? reversed[index] : reversed[index].toLowerCase();
        } else {
            decoded += input[i];
        }
    }
    
    return [
        ['Atbash Cipher (Reverse Alphabet)', decoded]
    ];
}