import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const COURSE = {
  slug: 'medicina',
  name: 'Medicina',
  years: 6,
};

const SUBJECTS: Array<{ slug: string; name: string }> = [
  // Ciclo basico (1o-2o ano)
  { slug: 'anatomia', name: 'Anatomia' },
  { slug: 'histologia', name: 'Histologia' },
  { slug: 'embriologia', name: 'Embriologia' },
  { slug: 'bioquimica', name: 'Bioquímica' },
  { slug: 'biofisica', name: 'Biofísica' },
  { slug: 'biologia-celular-e-molecular', name: 'Biologia Celular e Molecular' },
  { slug: 'genetica', name: 'Genética' },
  { slug: 'fisiologia', name: 'Fisiologia' },
  { slug: 'imunologia', name: 'Imunologia' },
  { slug: 'microbiologia', name: 'Microbiologia' },
  { slug: 'parasitologia', name: 'Parasitologia' },
  { slug: 'patologia', name: 'Patologia' },
  { slug: 'farmacologia', name: 'Farmacologia' },
  { slug: 'epidemiologia-e-bioestatistica', name: 'Epidemiologia e Bioestatística' },
  { slug: 'bioetica', name: 'Bioética' },

  // Ciclo clinico (3o-5o ano)
  { slug: 'semiologia', name: 'Semiologia' },
  { slug: 'clinica-medica', name: 'Clínica Médica' },
  { slug: 'cardiologia', name: 'Cardiologia' },
  { slug: 'pneumologia', name: 'Pneumologia' },
  { slug: 'gastroenterologia', name: 'Gastroenterologia' },
  { slug: 'nefrologia', name: 'Nefrologia' },
  { slug: 'endocrinologia', name: 'Endocrinologia' },
  { slug: 'neurologia', name: 'Neurologia' },
  { slug: 'hematologia', name: 'Hematologia' },
  { slug: 'reumatologia', name: 'Reumatologia' },
  { slug: 'infectologia', name: 'Infectologia' },
  { slug: 'dermatologia', name: 'Dermatologia' },
  { slug: 'psiquiatria', name: 'Psiquiatria' },
  { slug: 'pediatria', name: 'Pediatria' },
  { slug: 'ginecologia-e-obstetricia', name: 'Ginecologia e Obstetrícia' },
  { slug: 'cirurgia-geral', name: 'Cirurgia Geral' },
  { slug: 'ortopedia', name: 'Ortopedia' },
  { slug: 'oftalmologia', name: 'Oftalmologia' },
  { slug: 'otorrinolaringologia', name: 'Otorrinolaringologia' },
  { slug: 'urologia', name: 'Urologia' },
  { slug: 'radiologia-e-diagnostico-por-imagem', name: 'Radiologia e Diagnóstico por Imagem' },
  { slug: 'anestesiologia', name: 'Anestesiologia' },
  { slug: 'medicina-de-familia-e-comunidade', name: 'Medicina de Família e Comunidade' },

  // Internato / saude publica
  { slug: 'saude-coletiva', name: 'Saúde Coletiva' },
  { slug: 'emergencias-medicas', name: 'Emergências Médicas' },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL nao definida.');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const course = await prisma.course.upsert({
      where: { slug: COURSE.slug },
      update: { name: COURSE.name, years: COURSE.years },
      create: COURSE,
    });

    for (const subject of SUBJECTS) {
      await prisma.subject.upsert({
        where: { courseId_slug: { courseId: course.id, slug: subject.slug } },
        update: { name: subject.name },
        create: {
          courseId: course.id,
          slug: subject.slug,
          name: subject.name,
        },
      });
    }

    const total = await prisma.subject.count({ where: { courseId: course.id } });
    console.log(`[seed] curso "${course.name}" (${course.years} anos) com ${total} materias.`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
