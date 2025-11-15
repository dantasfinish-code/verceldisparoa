const fetch = require('node-fetch');

// Função auxiliar para formatar o CPF/CNPJ (remover caracteres não numéricos)
const cleanDocument = (doc) => doc ? doc.replace(/[^0-9]/g, '') : '';

// Função auxiliar para formatar o telefone (remover caracteres não numéricos)
const cleanPhone = (phone) => phone ? phone.replace(/[^0-9]/g, '') : '';

// Valor fixo em centavos (R$ 46,80)
const VALOR_CENTAVOS = 4680;

// Chave de API (Substitua pela chave real do usuário)
// A chave foi extraída do pagamento.php: sk_live_EBKYpl0XppoRJSr1sHv9oiQzO9qrMSC2pUnt0lQBUJVP Sxb4:c4458e78-0de1-4f5d-8814-907ee1638e72
// Por segurança, a chave deve ser armazenada em uma variável de ambiente no Vercel.
// A chave de API deve ser configurada como uma variável de ambiente no Vercel.
// O valor foi extraído do pagamento.php original.
const API_KEY = process.env.PIX_API_KEY || 'sk_live_EBKYpl0XppoRJSr1sHv9oiQzO9qrMSC2pUnt0lQBUJVP Sxb4:c4458e78-0de1-4f5d-8814-907ee1638e72';
const API_URL = 'https://api.ghostspaysv2.com/functions/v1/transactions';

module.exports = async (req, res) => {
    // Configura o cabeçalho para JSON
    res.setHeader('Content-Type', 'application/json');

    // O Vercel trata requisições GET e POST para o mesmo arquivo `index.js`
    // No entanto, o front-end está fazendo um POST para `pagamento.php` (que será corrigido)
    // E o redirecionamento inicial é um GET para `/api/index`.
    // Vamos assumir que a requisição para a API de PIX virá via POST.
    
    // Extrai os dados do corpo da requisição (POST)
    const { nome, cpf, email, telefone } = req.body;

    // Se a requisição for GET, vamos apenas retornar um erro ou uma mensagem de instrução
    if (req.method === 'GET') {
        // Se for um GET, o front-end está chamando `/api/index?nome=...`
        // O front-end em `dados.html` precisa ser corrigido para chamar a API de PIX diretamente
        // e não redirecionar para `/api/index`.
        // Por enquanto, vamos retornar um erro claro.
        return res.status(400).json({
            success: false,
            error: 'Método GET não suportado para geração de PIX. Use POST.',
            details: 'O fluxo de redirecionamento em dados.html está incorreto. Ele deve chamar a API de PIX diretamente via JavaScript (fetch) e não redirecionar para ela.'
        });
    }

    // Validação de dados
    const cleanCpf = cleanDocument(cpf);
    const cleanTelefone = cleanPhone(telefone);

    if (!cleanCpf || cleanCpf.length !== 11) {
        return res.status(400).json({ success: false, error: 'CPF inválido. Deve conter 11 dígitos.' });
    }

    if (!cleanTelefone || cleanTelefone.length < 10) {
        return res.status(400).json({ success: false, error: 'Telefone inválido. Mínimo 10 dígitos.' });
    }

    // Corpo da requisição para a API de PIX
    const requestBody = {
        customer: {
            document: {
                number: cleanCpf
            },
            name: nome || 'Cliente Sem Nome',
            email: email || 'cliente@email.com',
            phone: cleanTelefone || '11999999999'
        },
        paymentMethod: 'PIX',
        items: [
            {
                title: 'Taxa EMEX + Liberacao',
                unitPrice: VALOR_CENTAVOS,
                quantity: 1,
                tangible: false
            }
        ],
        amount: VALOR_CENTAVOS
    };

    try {
        // Remove espaços em branco da chave antes de codificar
        const cleanApiKey = API_KEY.replace(/\s/g, '');
        const auth = `Basic ${Buffer.from(cleanApiKey).toString('base64')}`;

        if (!API_KEY || API_KEY.includes('YOUR_API_KEY')) {
            return res.status(500).json({
                success: false,
                error: 'Chave de API não configurada.',
                details: 'Por favor, configure a variável de ambiente PIX_API_KEY no Vercel.'
            });
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': auth
            },
            body: JSON.stringify(requestBody)
        });

        let data;
        const responseText = await response.text();

        try {
            data = JSON.parse(responseText);
        } catch (e) {
            // Trata o erro de resposta não-JSON (como "Unauthorized")
            console.error('Erro ao parsear JSON:', responseText);
            return res.status(response.status).json({
                success: false,
                error: 'Erro de comunicação com a API de PIX.',
                details: `A API retornou um erro não-JSON: ${responseText.substring(0, 50)}...`,
                http_status: response.status
            });
        }

        // Se a resposta HTTP não for OK (mas for JSON), tratamos aqui
        if (!response.ok) {
            const errorMsg = data.message || data.error || `Erro HTTP ${response.status} na API externa.`;
            return res.status(response.status).json({
                success: false,
                error: errorMsg,
                full_response: data
            });
        }



        // Verifica se o PIX foi gerado
        if (data.status === 'refused') {
            const refusedReason = data.refusedReason ? data.refusedReason.description : 'Pagamento recusado pela operadora.';
            return res.status(400).json({
                success: false,
                error: refusedReason,
                refused: true,
                full_response: data
            });
        }

        if (!data.pix || !data.pix.qrcode) {
            return res.status(400).json({
                success: false,
                error: 'QR Code PIX não foi gerado pela API. Verifique os dados de entrada.',
                full_response: data
            });
        }

        // Sucesso
        return res.status(200).json({
            success: true,
            transactionId: data.id,
            qrcode: data.pix.qrcode,
            expirationDate: data.pix.expirationDate,
            amount: data.amount
        });

    } catch (error) {
        console.error('Erro na chamada da API:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno ao processar a requisição PIX.',
            details: error.message
        });
    }
};
