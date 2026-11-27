// The portal saves the model index. Append new models after the existing ones.
export const models = [
  {
    key: "atendimento", name: "Atendente", label: "Recepção (Atendente)", roleLabel: "Recepção",
    description: "Recebe o contato e identifica o motivo da conversa.",
    goal: "Identificar o motivo do contato, responder à dúvida inicial e orientar o próximo passo.",
    greeting: "Como posso ajudar você hoje?",
    questions: ["Que detalhe a equipe precisa saber para atender seu pedido?","Você tem algum prazo para resolver isso?"]
  },
  {
    key: "consultoria", name: "Consultor", roleLabel: "Consultoria",
    description: "Entende a necessidade e orienta a escolha.",
    goal: "Entender as prioridades do cliente e recomendar uma opção com base nas informações disponíveis.",
    greeting: "O que você está procurando?",
    questions: ["Que características são mais importantes para você?","Para qual situação você pretende usar a solução?"]
  },
  {
    key: "comercial", name: "Comercial",
    description: "Qualifica oportunidades para a equipe de vendas.",
    goal: "Entender o que o cliente deseja comprar, qualificar a oportunidade e combinar o próximo passo de vendas.",
    greeting: "Qual produto ou serviço despertou seu interesse?",
    questions: ["Para quando você precisa da solução?","Qual faixa de investimento você tem em mente?"]
  },
  {
    key: "suporte", name: "Suporte",
    description: "Organiza o problema antes de acionar a equipe.",
    goal: "Identificar o problema, orientar a solução com as informações da empresa e encaminhar os casos que exigem a equipe.",
    greeting: "O que aconteceu?",
    questions: ["Quando o problema começou?","O que você já tentou fazer?"]
  },
  {
    key: "pos-venda", name: "Pós-venda",
    description: "Acompanha a experiência após a compra.",
    goal: "Acompanhar a experiência após a compra, esclarecer dúvidas e registrar o que precisa de acompanhamento.",
    greeting: "Como foi sua experiência?",
    questions: ["O que atendeu às suas expectativas?","Há algo que você gostaria que a equipe acompanhasse?"]
  },
  {
    key: "personalizado", name: "Personalizado",
    description: "Combine funções em um agente que acompanha toda a conversa.",
    goal: "Identificar a necessidade atual e usar as funções selecionadas para acompanhar o cliente na mesma conversa.",
    greeting: "Como posso ajudar?",
    questions: ["Qual resultado você espera desse atendimento?","Há algum detalhe importante para o próximo passo?"]
  },
  {
    key: "financeiro", name: "Financeiro",
    description: "Esclarece dúvidas sobre faturas, vencimentos e formas de pagamento.",
    goal: "Orientar sobre faturas e pagamentos conforme as condições da empresa. Usar dados de uma fatura apenas quando confirmados para esse cliente. Nunca solicitar senhas ou dados completos de cartão.",
    greeting: "Olá! Qual é a sua dúvida sobre o pagamento?",
    questions: ["A qual pedido ou mensalidade se refere?","Que informação sobre esse pagamento você precisa confirmar?"]
  },
  {
    key: "vendas", name: "Vendas",
    description: "Ajuda o cliente a escolher um produto e seguir com a compra.",
    goal: "Comparar as opções do catálogo conforme a necessidade do cliente e explicar como concluir a compra pelo canal oficial. Usar apenas preços, estoque e condições confirmados.",
    greeting: "Olá! O que você gostaria de comprar?",
    questions: ["O que mais importa para você nessa escolha?","Qual das opções apresentadas você prefere?"]
  },
  {
    key: "duvidas", name: "Dúvidas",
    description: "Responde perguntas frequentes sobre serviços, horários e regras.",
    goal: "Responder à pergunta com as informações da empresa. Se a resposta depender de um dado ausente, explicar o que precisa ser confirmado.",
    greeting: "Olá! Qual dúvida posso esclarecer?",
    questions: ["Sobre qual produto ou serviço é a sua dúvida?","Qual detalhe você gostaria de entender melhor?"]
  },
  {
    key: "reservas", name: "Reservas",
    description: "Reúne data, número de pessoas e preferências para uma reserva.",
    goal: "Levantar os detalhes da reserva e orientar sobre as regras da empresa. Só afirmar que há disponibilidade ou que a reserva foi feita com confirmação do sistema responsável.",
    greeting: "Olá! O que você gostaria de reservar?",
    questions: ["Para qual data você quer a reserva?","Para quantas pessoas será?"]
  },
  {
    key: "orcamento", name: "Orçamento",
    description: "Reúne escopo, quantidade e prazo para preparar uma cotação.",
    goal: "Entender o que será cotado e reunir os dados para a proposta. Informar valores apenas quando houver preço aplicável confirmado pela empresa.",
    greeting: "Olá! De qual produto ou serviço você precisa de um orçamento?",
    questions: ["Qual quantidade ou dimensão devemos considerar?","Para quando você precisa da entrega?"]
  },
  {
    key: "matriculas", name: "Matrículas",
    description: "Orienta sobre cursos, turmas e etapas de inscrição.",
    goal: "Identificar o curso e a turma de interesse e orientar sobre requisitos e inscrição conforme as regras da instituição. Só confirmar vaga ou matrícula com registro no sistema responsável.",
    greeting: "Olá! Em qual curso você gostaria de se matricular?",
    questions: ["Qual turno funciona melhor para você?","Quando você gostaria de começar?"]
  },
  {
    key: "agendamento", name: "Agendamento",
    description: "Organiza pedidos de horário para consultas ou serviços.",
    goal: "Identificar serviço, dia e horário desejados. Apresentar horários e confirmar agendamento somente quando a agenda responsável fornecer esses dados.",
    greeting: "Olá! Qual serviço você gostaria de agendar?",
    questions: ["Qual dia funciona melhor para você?","Você prefere algum horário nesse dia?"]
  },
  {
    key: "cobranca", name: "Cobrança",
    description: "Orienta sobre cobranças recebidas, segunda via e regularização.",
    goal: "Ajudar o cliente a conferir uma cobrança e solicitar segunda via pelo canal oficial. Não presumir pendências nem prometer descontos, baixa ou renegociação sem confirmação.",
    greeting: "Olá! Como posso ajudar com a cobrança que você recebeu?",
    questions: ["A qual pedido ou mensalidade a cobrança se refere?","Você precisa de segunda via, revisão do valor ou opções de regularização?"]
  }
];

export const customModel = models.findIndex(model=>model.key==='personalizado');
export const serviceRoles = models.flatMap((model,index)=>index===customModel ? [] : [{
  key:model.key, label:model.roleLabel || model.name, model:index
}]);
