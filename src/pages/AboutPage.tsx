export default function AboutPage() {
  return (
    <section className="prose max-w-3xl">
      <h2>About InteLections</h2>
      <p>
        <strong>InteLections</strong> is a web application project developed as part of
        academic studies in the field of Computer Science – Programming.
      </p>
      <p>
        The system has been designed to support both <em>students</em> and <em>teachers</em>
        in the process of micro-learning. It allows to create and manage short lessons
        (micro-lectures), organize them into courses, add tests, track progress and
        interact in groups and classes.
      </p>
      <p>
        The project was prepared within the framework of studies at the{" "}
        <strong>University of Information Technology and Management in Rzeszów (WSIiZ)</strong>.
        It is intended both as a proof of concept and as a didactic tool.
      </p>
      <h3>Main goals</h3>
      <ul>
        <li>Provide an intuitive platform for micro-learning</li>
        <li>Enable creation of courses, lessons and quizzes</li>
        <li>Support cooperation and competition modes</li>
        <li>Give teachers simple management tools</li>
        <li>Allow students to learn in a personalized way</li>
      </ul>
      <p className="mt-6 text-sm text-neutral-600">
        This project is non-commercial and was created for educational purposes only.
      </p>
    </section>
  );
}
